let urlInputCount = 1;
let pollingInterval = null;

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
        
        // Show status area
        document.getElementById('statusArea').style.display = 'block';
        document.getElementById('jobInfo').innerHTML = `
            <div class="alert alert-info">
                Job ID: <strong>${data.data.jobId}</strong><br>
                Total URLs: ${data.data.totalUrls}
                ${data.data.invalidUrls?.length ? `<br>Invalid URLs skipped: ${data.data.invalidUrls.length}` : ''}
            </div>
        `;
        
        // Start polling
        if (pollingInterval) clearInterval(pollingInterval);
        pollJobStatus(data.data.jobId);
        
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Videos';
    }
}

async function pollJobStatus(jobId) {
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/download/${jobId}`);
            const data = await response.json();
            
            if (!data.success) {
                clearInterval(pollingInterval);
                alert('Error: ' + data.error);
                return;
            }
            
            displayJobStatus(data.data);
            
            // Stop polling when job is complete
            if (data.data.status === 'completed' || data.data.status === 'failed') {
                clearInterval(pollingInterval);
            }
            
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1000); // Poll every second
}

function displayJobStatus(job) {
    const itemsContainer = document.getElementById('downloadItems');
    itemsContainer.innerHTML = '';
    
    job.items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'card mb-2';
        
        let statusBadge = '';
        let progressBar = '';
        
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
                    const downloadUrl = `/api/download/${job.id}/files/${encodeURIComponent(item.filename)}`;
                    statusBadge += `<a href="${downloadUrl}" class="btn btn-sm btn-success ms-2">Download</a>`;
                }
                break;
            case 'failed':
                statusBadge = '<span class="badge bg-danger">Failed</span>';
                if (item.error) {
                    statusBadge += `<div class="alert alert-danger mt-2 py-2">${item.error}</div>`;
                }
                break;
        }
        
        itemDiv.innerHTML = `
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1 me-3">
                        <div class="text-truncate">${item.url}</div>
                    </div>
                    ${statusBadge}
                </div>
                ${progressBar}
            </div>
        `;
        
        itemsContainer.appendChild(itemDiv);
    });
    
    // Update overall status
    const jobStatus = document.getElementById('jobInfo');
    if (job.status === 'completed') {
        jobStatus.innerHTML = `
            <div class="alert alert-success">
                All downloads completed successfully!
            </div>
        `;
    } else if (job.status === 'failed') {
        jobStatus.innerHTML = `
            <div class="alert alert-warning">
                Some downloads failed. Check individual items for details.
            </div>
        `;
    }
}
