let pollingInterval = null;
const autoDownloadedJobs = new Set();
let autoDownloadInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    // Load formats from API
    fetchFormats();
    
    // Add URL button
    document.getElementById('addUrlBtn').addEventListener('click', addUrlInput);
    
    // Download button
    document.getElementById('downloadBtn').addEventListener('click', startDownload);
    
    // Handle URL input removal
    document.getElementById('urlInputs').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-url')) {
            const inputGroup = e.target.closest('.input-group');
            if (document.querySelectorAll('.url-input').length > 1) {
                inputGroup.remove();
                updateRemoveButtons();
            }
        }
    });
    
    updateRemoveButtons();
    
    // Show any existing jobs (download history) on load
    fetchAllJobs();
});

async function fetchFormats() {
    try {
        const response = await fetch('/api/formats');
        const data = await response.json();
        
        if (data.success && data.data) {
            const select = document.getElementById('formatSelect');
            select.innerHTML = '';
            
            data.data.forEach(format => {
                const option = document.createElement('option');
                option.value = format.id;
                option.textContent = format.label;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to fetch formats:', error);
    }
}

function addUrlInput() {
    const container = document.getElementById('urlInputs');
    const newInput = document.createElement('div');
    newInput.className = 'input-group mb-2';
    newInput.innerHTML = `
        <input type="url" class="form-control url-input" placeholder="https://www.youtube.com/watch?v=..." required>
        <button class="btn btn-outline-danger remove-url" type="button">Remove</button>
    `;
    container.appendChild(newInput);
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const inputs = document.querySelectorAll('.url-input');
    const removeButtons = document.querySelectorAll('.remove-url');
    
    removeButtons.forEach(btn => {
        btn.disabled = inputs.length <= 1;
    });
}

async function startDownload() {
    const urlInputs = document.querySelectorAll('.url-input');
    const urls = Array.from(urlInputs)
        .map(input => input.value.trim())
        .filter(url => url.length > 0);
    
    if (urls.length === 0) {
        alert('Please enter at least one YouTube URL');
        return;
    }
    
    const format = document.getElementById('formatSelect').value;
    
    // Disable download button
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Processing...';
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ urls, format })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            let errorMessage = data.error || 'Failed to start download';
            if (data.invalidUrls && data.invalidUrls.length > 0) {
                errorMessage += '\n\nInvalid URLs:\n' + data.invalidUrls.join('\n');
            }
            alert(errorMessage);
            return;
        }
        
        // Show status area and start polling all jobs
        document.getElementById('statusArea').style.display = 'block';
        fetchAllJobs();
        
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Videos';
    }
}

async function fetchAllJobs() {
    try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to fetch jobs:', data.error);
            return;
        }
        
        renderJobs(data.data);
        updatePolling(data.data);
        handleAutoDownload(data.data);
        
        // Show the history panel whenever there are jobs to display
        if (data.data.length > 0) {
            document.getElementById('statusArea').style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to fetch jobs:', error);
    }
}

function updatePolling(jobs) {
    const hasActiveJobs = jobs.some(job => job.status === 'queued' || job.status === 'downloading');
    
    if (hasActiveJobs) {
        // Keep polling while any download is running
        if (!pollingInterval) {
            pollingInterval = setInterval(fetchAllJobs, 1000);
        }
    } else {
        // Stop polling once everything is done
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
}

function handleAutoDownload(jobs) {
    // On the very first load, treat already-finished jobs as handled so that
    // the download history doesn't re-download on every page refresh.
    if (!autoDownloadInitialized) {
        jobs.forEach(job => {
            if (isTerminal(job)) autoDownloadedJobs.add(job.id);
        });
        autoDownloadInitialized = true;
        return;
    }
    
    // Download each job exactly once, the moment it finishes.
    jobs.forEach(job => {
        if (isTerminal(job) && !autoDownloadedJobs.has(job.id)) {
            autoDownloadedJobs.add(job.id);
            if (job.files.length > 0) {
                triggerFinishedJobDownload(job);
            }
        }
    });
}

function isTerminal(job) {
    return job.status === 'completed' || job.status === 'failed';
}

function triggerFinishedJobDownload(job) {
    // A single finished file downloads directly; multiple files arrive as a ZIP.
    const url = job.files.length === 1
        ? `/api/download/${encodeURIComponent(job.id)}/files/${encodeURIComponent(job.files[0])}`
        : `/api/download/${encodeURIComponent(job.id)}/zip`;
    triggerDownload(url);
}

function triggerDownload(url) {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function renderJobs(jobs) {
    const container = document.getElementById('jobsList');
    const jobsStatus = document.getElementById('jobsStatus');
    
    jobsStatus.textContent = `${jobs.length} job${jobs.length === 1 ? '' : 's'}`;
    
    if (jobs.length === 0) {
        container.innerHTML = '<div class="text-muted">No downloads yet.</div>';
        return;
    }
    
    container.innerHTML = '';
    jobs.forEach(job => {
        container.appendChild(createJobCard(job));
    });
}

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'card mb-3 job-card';
    
    const itemsHtml = job.items.map(item => createItemHtml(job, item)).join('');
    
    const zipButton = job.files.length > 0
        ? `<a href="/api/download/${encodeURIComponent(job.id)}/zip" class="btn btn-sm btn-outline-primary ms-2">Download ZIP (${job.files.length})</a>`
        : '';
    
    card.innerHTML = `
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <strong>Job: ${job.id}</strong>
                    <span class="text-muted small ms-2">${new Date(job.createdAt).toLocaleString()}</span>
                </div>
                <div class="text-end">
                    ${statusBadgeFor(job.status)}
                    ${zipButton}
                </div>
            </div>
            <div class="progress mt-3 mb-1">
                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                     role="progressbar" style="width: ${job.progress}%">
                    ${job.progress}%
                </div>
            </div>
            ${itemsHtml}
        </div>
    `;
    
    return card;
}

function createItemHtml(job, item) {
    let statusBadge = '';
    let progressBar = '';
    let downloadButton = '';
    
    switch (item.status) {
        case 'queued':
            statusBadge = '<span class="badge bg-secondary">Queued</span>';
            break;
        case 'downloading':
            statusBadge = '<span class="badge bg-primary">Downloading</span>';
            progressBar = `
                <div class="progress mt-2">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         role="progressbar" style="width: ${item.progress}%">
                        ${item.progress.toFixed(1)}%
                    </div>
                </div>
            `;
            break;
        case 'completed':
            statusBadge = '<span class="badge bg-success">Completed</span>';
            if (item.filename) {
                const downloadUrl = `/api/download/${encodeURIComponent(job.id)}/files/${encodeURIComponent(item.filename)}`;
                downloadButton = `<a href="${downloadUrl}" class="btn btn-sm btn-success ms-2">Download</a>`;
            }
            break;
        case 'failed':
            statusBadge = '<span class="badge bg-danger">Failed</span>';
            if (item.error) {
                statusBadge += `<div class="alert alert-danger mt-2 py-2 mb-0">${item.error}</div>`;
            }
            break;
    }
    
    return `
        <div class="border-top pt-2 mt-2">
            <div class="d-flex justify-content-between align-items-center">
                <div class="flex-grow-1 me-3">
                    <div class="text-truncate small">${item.url}</div>
                </div>
                <div class="text-end">
                    ${statusBadge}
                    ${downloadButton}
                </div>
            </div>
            ${progressBar}
        </div>
    `;
}

function statusBadgeFor(status) {
    switch (status) {
        case 'queued':
            return '<span class="badge bg-secondary">Queued</span>';
        case 'downloading':
            return '<span class="badge bg-primary">Downloading</span>';
        case 'completed':
            return '<span class="badge bg-success">Completed</span>';
        case 'failed':
            return '<span class="badge bg-warning text-dark">Failed</span>';
        default:
            return '';
    }
}
