const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Configure storage
const baseUploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(baseUploadDir)) {
    fs.mkdirSync(baseUploadDir);
}

// Utility to safely resolve paths
const resolvePath = (userPath) => {
    const safePath = path.normalize(userPath || '').replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(baseUploadDir, safePath);
    if (!fullPath.startsWith(baseUploadDir)) {
        return baseUploadDir;
    }
    return fullPath;
};

// Helper: Get unique filename "file (1).txt"
const getUniqueFilename = (dir, name) => {
    let fileName = name;
    let filePath = path.join(dir, fileName);
    let counter = 1;

    const ext = path.extname(name);
    const base = path.basename(name, ext);

    while (fs.existsSync(filePath)) {
        fileName = `${base} (${counter})${ext}`;
        filePath = path.join(dir, fileName);
        counter++;
    }
    return fileName;
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = resolvePath(req.query.path);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Fix encoding
        let name = file.originalname;
        try {
            name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch (e) { }

        const conflictMode = req.query.conflictMode; // 'overwrite' or 'rename' (default rename behavior in our custom logic)
        const uploadPath = resolvePath(req.query.path);
        const fullPath = path.join(uploadPath, name);

        if (fs.existsSync(fullPath)) {
            if (conflictMode === 'overwrite') {
                // Return original name, Multer will overwrite
                cb(null, name);
            } else {
                // Default or 'rename' -> generate unique name
                cb(null, getUniqueFilename(uploadPath, name));
            }
        } else {
            cb(null, name);
        }
    }
});

const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use('/files', express.static(baseUploadDir));

// API: Check for existing files
app.post('/api/check-exists', (req, res) => {
    const { filenames, path: userPath } = req.body;
    const targetDir = resolvePath(userPath);

    if (!Array.isArray(filenames)) {
        return res.status(400).json({ error: 'filenames must be an array' });
    }

    const existing = filenames.filter(name => fs.existsSync(path.join(targetDir, name)));
    res.json({ existing });
});

app.get('/api/files', (req, res) => {
    const targetDir = resolvePath(req.query.path);

    fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
        if (err) return res.status(500).json({ error: 'Unable to scan directory' });

        const fileInfos = entries.map(entry => {
            const stats = fs.statSync(path.join(targetDir, entry.name));
            return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: entry.isDirectory() ? 0 : stats.size,
                displayDate: stats.mtime
            };
        });

        fileInfos.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return b.displayDate - a.displayDate;
        });

        res.json(fileInfos);
    });
});

app.post('/api/mkdir', (req, res) => {
    const { folderName, currentPath } = req.body;
    if (!folderName) return res.status(400).json({ error: 'Folder name required' });

    const targetPath = path.join(resolvePath(currentPath), folderName);

    if (fs.existsSync(targetPath)) {
        return res.status(400).json({ error: 'Folder already exists' });
    }

    fs.mkdir(targetPath, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to create folder' });
        res.json({ success: true });
    });
});

app.post('/api/upload', upload.array('files'), (req, res) => {
    res.json({ message: 'Files uploaded successfully', count: req.files.length });
});

app.delete('/api/delete', (req, res) => {
    const targetPath = resolvePath(req.query.path);
    if (targetPath === baseUploadDir) return res.status(403).json({ error: 'Cannot delete root directory' });

    fs.rm(targetPath, { recursive: true, force: true }, (err) => {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ success: true });
    });
});

app.get('/api/content', (req, res) => {
    const targetPath = resolvePath(req.query.path);
    fs.readFile(targetPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Read failed' });
        res.send(data);
    });
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if ('IPv4' !== iface.family || iface.internal) continue;
            return iface.address;
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`\n🚀 Server running!`);
    console.log(`📂 Drop files in the browser to share.`);
    console.log(`\n👉 Access URL on your Local Network (Phone/PC):`);
    console.log(`   http://${ip}:${PORT}\n`);
});
