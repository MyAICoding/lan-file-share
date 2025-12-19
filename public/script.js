const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressContainer = document.getElementById('progress-container');
const refreshBtn = document.getElementById('refresh-btn');
const breadcrumbsContainer = document.getElementById('breadcrumbs');
const createFolderBtn = document.getElementById('create-folder-btn');
const toastContainer = document.getElementById('toast-container');

// Settings
const languageSelect = document.getElementById('language-select');
const themeBtns = document.querySelectorAll('.theme-btn');

// Modals
const previewModal = document.getElementById('preview-modal');
const previewBody = document.getElementById('preview-body');
const previewTitle = document.getElementById('preview-title');
const copyContentBtn = document.getElementById('copy-content-btn');
const conflictModal = document.getElementById('conflict-modal');
const conflictList = document.getElementById('conflict-list');
const conflictRenameBtn = document.getElementById('conflict-rename-btn');
const conflictOverwriteBtn = document.getElementById('conflict-overwrite-btn');
const closeModalBtns = document.querySelectorAll('.close-btn');

let currentPath = '';

// I18n
const translations = {
    en: {
        tagline: "Seamless LAN File Transfer",
        drag_drop: "Drag & Drop files here",
        or_browse: "or click to browse",
        shared_files: "Shared Files",
        home: "Home",
        enter_folder_name: "Enter folder name:",
        failed_create_folder: "Failed to create folder",
        upload_complete: "Upload Complete!",
        upload_failed: "Upload Failed",
        error_sending: "Error sending files",
        delete_confirm: "Are you sure you want to delete {name}?",
        delete_failed: "Delete failed",
        preview_unavailable: "Preview not available for this file type.",
        download_view: "Download to view",
        copy: "Copy",
        copied_link: "File link copied!",
        copied_content: "Content copied!",
        failed_copy: "Failed to copy",
        modal_conflict_title: "File Conflict",
        modal_conflict_desc: "Some files already exist. What would you like to do?",
        btn_keep_both: "Keep Both (Rename)",
        btn_overwrite: "Overwrite",
        btn_copy: "Copy",
        modal_preview_title: "Preview",
        folder: "Folder",
        unknown: "Unknown"
    },
    zh: {
        tagline: "局域网文件无缝传输",
        drag_drop: "拖拽文件到此处",
        or_browse: "或点击浏览",
        shared_files: "共享文件",
        home: "首页",
        enter_folder_name: "请输入文件夹名称:",
        failed_create_folder: "创建文件夹失败",
        upload_complete: "上传完成!",
        upload_failed: "上传失败",
        error_sending: "发送文件错误",
        delete_confirm: "确定要删除 {name} 吗?",
        delete_failed: "删除失败",
        preview_unavailable: "预览不支持该文件类型",
        download_view: "下载查看",
        copy: "复制",
        copied_link: "文件链接已复制!",
        copied_content: "内容已复制!",
        failed_copy: "复制失败",
        modal_conflict_title: "文件冲突",
        modal_conflict_desc: "部分文件已存在，您希望如何处理？",
        btn_keep_both: "保留两者 (重命名)",
        btn_overwrite: "覆盖",
        btn_copy: "复制",
        modal_preview_title: "预览",
        folder: "文件夹",
        unknown: "未知"
    }
};

// Init Settings
let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
let currentTheme = localStorage.getItem('theme') || 'auto';

// Apply Initial Settings
applyLanguage(currentLang);
applyTheme(currentTheme);

languageSelect.value = currentLang;
languageSelect.addEventListener('change', (e) => applyLanguage(e.target.value));

themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
    });
});

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    const t = translations[lang];

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.textContent = t[key];
    });

    // Re-render things that might have text in them logic-wise (like Breadcrumbs)
    renderBreadcrumbs();
    // Also re-render file list to update "Folder" text maybe?
    // Ideally we should just fetch files again or re-render
    if (fileList.children.length > 0) fetchFiles();
}

function t(key, params = {}) {
    let str = translations[currentLang][key] || key;
    for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
    }
    return str;
}

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('theme', theme);

    // Update buttons
    themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    if (theme === 'auto') {
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

// System theme listener
window.matchMedia("(prefers-color-scheme: dark)").addEventListener('change', e => {
    if (currentTheme === 'auto') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
});


// Core Logic
fetchFiles();

refreshBtn.addEventListener('click', () => fetchFiles());

createFolderBtn.addEventListener('click', async () => {
    const folderName = prompt(t('enter_folder_name'));
    if (!folderName) return;
    try {
        const response = await fetch('/api/mkdir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderName, currentPath })
        });
        if (response.ok) fetchFiles();
        else alert(t('failed_create_folder'));
    } catch (e) {
        console.error(e);
    }
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleUploadIntention(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleUploadIntention(fileInput.files);
});

async function handleUploadIntention(files) {
    const fileArray = Array.from(files);
    const filenames = fileArray.map(f => f.name);

    try {
        const res = await fetch('/api/check-exists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames, path: currentPath })
        });
        const data = await res.json();

        if (data.existing && data.existing.length > 0) {
            showConflictModal(data.existing, fileArray);
        } else {
            uploadFiles(fileArray, 'rename');
        }
    } catch (e) {
        console.error("Check failed", e);
        uploadFiles(fileArray, 'rename');
    }
}

function showConflictModal(conflictingNames, allFiles) {
    conflictList.innerHTML = '';
    conflictingNames.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        conflictList.appendChild(li);
    });

    conflictModal.classList.remove('hidden');

    const newRename = conflictRenameBtn.cloneNode(true);
    const newOverwrite = conflictOverwriteBtn.cloneNode(true);
    conflictRenameBtn.parentNode.replaceChild(newRename, conflictRenameBtn);
    conflictOverwriteBtn.parentNode.replaceChild(newOverwrite, conflictOverwriteBtn);

    const freshRenameBtn = document.getElementById('conflict-rename-btn');
    const freshOverwriteBtn = document.getElementById('conflict-overwrite-btn');

    // Update text content for these buttons based on lang (redundant if applyLanguage called, but for safety on dynamic replacement)
    freshRenameBtn.textContent = t('btn_keep_both');
    freshOverwriteBtn.textContent = t('btn_overwrite');

    freshRenameBtn.addEventListener('click', () => {
        conflictModal.classList.add('hidden');
        uploadFiles(allFiles, 'rename');
    });

    freshOverwriteBtn.addEventListener('click', () => {
        conflictModal.classList.add('hidden');
        uploadFiles(allFiles, 'overwrite');
    });
}


function uploadFiles(files, conflictMode = 'rename') {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    progressContainer.classList.remove('hidden');

    const xhr = new XMLHttpRequest();
    const encodedPath = encodeURIComponent(currentPath);
    xhr.open('POST', `/api/upload?path=${encodedPath}&conflictMode=${conflictMode}`, true);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressBar.style.width = percentComplete + '%';
            progressText.textContent = Math.round(percentComplete) + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            progressText.textContent = t('upload_complete');
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                fetchFiles();
            }, 1000);
        } else {
            progressText.textContent = t('upload_failed');
            console.error('Upload failed');
        }
    };

    xhr.onerror = () => {
        progressText.textContent = t('error_sending');
    };

    xhr.send(formData);
}

function fetchFiles() {
    const encodedPath = encodeURIComponent(currentPath);
    fetch(`/api/files?path=${encodedPath}`)
        .then(response => response.json())
        .then(files => {
            renderFileList(files);
            renderBreadcrumbs();
        })
        .catch(err => console.error('Error loading files:', err));
}

function renderBreadcrumbs() {
    breadcrumbsContainer.innerHTML = '';

    const home = document.createElement('span');
    home.className = 'crumb';
    home.textContent = t('home');
    home.onclick = () => {
        currentPath = '';
        fetchFiles();
    };
    breadcrumbsContainer.appendChild(home);

    if (!currentPath) return;

    const parts = currentPath.split(/[/\\]/);
    let buildPath = '';

    parts.forEach((part, index) => {
        const sep = document.createElement('span');
        sep.textContent = ' / ';
        sep.style.color = 'var(--text-muted)';
        breadcrumbsContainer.appendChild(sep);

        buildPath += part;

        const crumb = document.createElement('span');
        crumb.className = 'crumb';
        crumb.textContent = part;
        const pathForThisCrumb = buildPath;
        crumb.onclick = () => {
            currentPath = pathForThisCrumb;
            fetchFiles();
        };

        breadcrumbsContainer.appendChild(crumb);
        buildPath += '/';
    });
}

function renderFileList(files) {
    fileList.innerHTML = '';

    if (currentPath) {
        const li = document.createElement('li');
        li.className = 'file-item back-item';
        li.innerHTML = `
            <div class="file-info">
                 <div class="file-icon">↩️</div>
                 <div class="file-name">..</div>
            </div>
        `;
        li.onclick = () => {
            const parts = currentPath.split(/[/\\]/);
            parts.pop();
            currentPath = parts.join('/');
            fetchFiles();
        };
        fileList.appendChild(li);
    }

    files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        const iconConfig = getFileIcon(file);

        li.innerHTML = `
            <div class="file-info" style="cursor: pointer;">
                <div class="file-icon">${iconConfig.icon}</div>
                <div class="file-details">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-meta">${file.isDirectory ? t('folder') : formatBytes(file.size)} • ${new Date(file.displayDate).toLocaleDateString()}</div>
                </div>
            </div>
            <div class="actions">
                ${!file.isDirectory ? `
                <button class="action-btn copy-link-btn" title="${t('copy')}">🔗</button>
                <button class="action-btn download-btn" title="${t('download_view')}">⬇</button>
                <button class="action-btn preview-btn" title="${t('modal_preview_title')}">👁</button>
                ` : ''}
                <button class="action-btn delete-btn" title="Delete">🗑</button>
            </div>
        `;

        const fileInfo = li.querySelector('.file-info');
        fileInfo.onclick = () => {
            if (file.isDirectory) {
                currentPath = currentPath ? currentPath + '/' + file.name : file.name;
                fetchFiles();
            } else {
                handlePreview(file);
            }
        };

        if (!file.isDirectory) {
            const fullWebPath = window.location.origin + `/files/${currentPath ? encodeURIComponent(currentPath) + '/' : ''}${encodeURIComponent(file.name)}`;

            li.querySelector('.copy-link-btn').onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(fullWebPath, t('copied_link'));
            };

            li.querySelector('.download-btn').onclick = (e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = fullWebPath;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            li.querySelector('.preview-btn').onclick = (e) => {
                e.stopPropagation();
                handlePreview(file);
            };
        }

        li.querySelector('.delete-btn').onclick = async (e) => {
            e.stopPropagation();
            if (!confirm(t('delete_confirm', { name: file.name }))) return;
            const fullPath = currentPath ? currentPath + '/' + file.name : file.name;
            try {
                await fetch(`/api/delete?path=${encodeURIComponent(fullPath)}`, { method: 'DELETE' });
                fetchFiles();
            } catch (err) {
                alert(t('delete_failed'));
            }
        };

        fileList.appendChild(li);
    });
}

function getFileIcon(file) {
    if (file.isDirectory) return { icon: '📁' };
    const ext = file.name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return { icon: '🖼️', type: 'image' };
    if (['mp4', 'mov', 'avi'].includes(ext)) return { icon: '🎥', type: 'video' };
    if (['mp3', 'wav'].includes(ext)) return { icon: '🎵', type: 'audio' };
    if (['pdf'].includes(ext)) return { icon: '📄', type: 'pdf' };
    if (['txt', 'md', 'js', 'css', 'html', 'json'].includes(ext)) return { icon: '📝', type: 'text' };
    return { icon: '📦', type: 'unknown' };
}

function handlePreview(file) {
    const type = getFileIcon(file).type;
    const fullPath = (currentPath ? currentPath + '/' : '') + file.name;
    const staticUrl = `/files/${fullPath}`;

    previewTitle.textContent = file.name;
    previewBody.innerHTML = '';
    copyContentBtn.classList.add('hidden');

    const newCopyBtn = copyContentBtn.cloneNode(true);
    copyContentBtn.parentNode.replaceChild(newCopyBtn, copyContentBtn);
    const freshCopyBtn = document.getElementById('copy-content-btn');

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = staticUrl;
        img.style.maxWidth = '100%';
        previewBody.appendChild(img);
        showModal();
    } else if (type === 'text' || type === 'json') {
        freshCopyBtn.classList.remove('hidden');

        // Update button text
        freshCopyBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>${t('copy')}</span>
        `;

        fetch(`/api/content?path=${encodeURIComponent(fullPath)}`)
            .then(res => res.text())
            .then(text => {
                const pre = document.createElement('pre');
                pre.textContent = text;
                pre.style.whiteSpace = 'pre-wrap';
                previewBody.appendChild(pre);

                freshCopyBtn.onclick = () => {
                    copyToClipboard(text, t('copied_content'));
                };

                showModal();
            });
    } else {
        const msg = document.createElement('p');
        msg.textContent = t('preview_unavailable');
        const link = document.createElement('a');
        link.href = staticUrl;
        link.textContent = t('download_view');
        link.download = file.name;
        link.style.display = 'block';
        link.style.marginTop = '1rem';
        link.style.color = 'var(--primary)';
        previewBody.appendChild(msg);
        previewBody.appendChild(link);
        showModal();
    }
}

function showModal() {
    previewModal.classList.remove('hidden');
}

function copyToClipboard(text, successMsg) {
    if (!navigator.clipboard) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast(successMsg);
        } catch (err) {
            showToast(t('failed_copy'));
        }
        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
    }, (err) => {
        showToast(t('failed_copy'));
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

closeModalBtns.forEach(btn => {
    btn.onclick = () => {
        btn.closest('.modal').classList.add('hidden');
    };
});

window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.add('hidden');
    }
};

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
