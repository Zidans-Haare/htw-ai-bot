const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const { Documents } = require('../db.cjs');

const uploadDir = path.resolve(__dirname, '..', '..', '..', 'uploads', 'documents');

// Ensure the upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch(err => console.error("Failed to create upload directory", err));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Create a unique filename to avoid overwrites
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'document-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadLimit = parseInt(process.env.UPLOAD_LIMIT_MB) || 10;
const upload = multer({
    storage: storage,
    limits: { fileSize: uploadLimit * 1024 * 1024 }
});

module.exports = (authMiddleware) => {
    const router = express.Router();

    // GET all documents
    router.get('/documents', authMiddleware, async (req, res) => {
        try {
            const offset = parseInt(req.query.offset) || 0;
            const documents = await Documents.findMany({
                orderBy: { id: 'desc' },
                take: 100,
                skip: offset
            });
            res.json(documents);
        } catch (error) {
            console.error('Fehler beim Abrufen der Dokumente:', error);
            res.status(500).send('Serverfehler');
        }
    });

    // POST a new document
    router.post('/documents/upload', authMiddleware, (req, res, next) => {
        upload.single('document')(req, res, async (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ message: `Datei zu groß. Maximale Größe: ${uploadLimit}MB.` });
                }
                return res.status(400).json({ message: 'Upload-Fehler: ' + err.message });
            }
            if (!req.file) {
                return res.status(400).json({ message: 'Keine Datei hochgeladen.' });
            }

            try {
                // Extract description from the request body
                const { description, access_level } = req.body;

                // Determine file type
                const ext = path.extname(req.file.originalname).toLowerCase();
                let fileType;
                if (ext === '.pdf') fileType = 'pdf';
                else if (ext === '.docx') fileType = 'docx';
                else if (ext === '.md') fileType = 'md';
                else if (['.odt', '.ods', '.odp'].includes(ext)) fileType = ext.slice(1);
                else if (ext === '.xlsx') fileType = 'xlsx';
                else {
                    // Delete file and return error
                    await fs.unlink(req.file.path);
                    return res.status(400).json({ message: 'Unsupported file type. Allowed: PDF, DOCX, MD, ODT, ODS, ODP, XLSX.' });
                }

                // Save document info to the database
                const docData = {
                    filepath: req.file.filename,
                    file_type: fileType,
                    description: description || null,
                    access_level: access_level || 'employee'
                };
                const newDocument = await Documents.create({
                    data: docData
                });
                res.status(201).json(newDocument);
            } catch (error) {
                console.error('Fehler beim Speichern des Dokuments in der DB:', error);
                console.error('Error details:', error.message, error.stack);
                // If DB write fails, delete the uploaded file
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Fehler beim Löschen der Datei nach DB-Fehler:', unlinkError);
                }
                res.status(500).json({ message: 'Serverfehler beim Speichern der Dokument-Informationen.' });
            }
        });
    });

    // PUT (update) a document description
    router.put('/documents/:id', authMiddleware, async (req, res) => {
        const { id } = req.params;
        const { description, access_level } = req.body;

        const updateData = {};
        if (typeof description === 'string') updateData.description = description.trim();
        if (access_level) updateData.access_level = access_level;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'Keine Daten zum Aktualisieren.' });
        }

        try {
            const updatedDocument = await Documents.update({
                where: { id: parseInt(id) },
                data: updateData
            });

            res.status(200).json(updatedDocument);
        } catch (error) {
            console.error(`Fehler beim Aktualisieren der Beschreibung für Dokument ${id}:`, error);
            res.status(500).json({ message: 'Serverfehler beim Aktualisieren der Beschreibung.' });
        }
    });

    // DELETE a document
    router.delete('/documents/:id', authMiddleware, async (req, res) => {
        const { id } = req.params;
        try {
            // Check if the document exists in the database
            const document = await Documents.findUnique({ where: { id: parseInt(id) } });
            if (!document) {
                return res.status(404).json({ message: 'Dokument nicht in der Datenbank gefunden.' });
            }

            // Delete the file from the filesystem
            const filePath = path.join(__dirname, '..', '..', '..', 'uploads', 'documents', document.filepath);
            try {
                await fs.unlink(filePath);
            } catch (fileError) {
                // If the file doesn't exist, we can still proceed to delete the DB entry
                if (fileError.code !== 'ENOENT') {
                    throw fileError;
                }
                console.warn(`Datei nicht gefunden, wird aber aus der DB gelöscht: ${filePath}`);
            }

            // Delete the document from the database
            await Documents.delete({ where: { id: parseInt(id) } });

            res.status(200).json({ message: 'Dokument erfolgreich gelöscht.' });
        } catch (error) {
            console.error(`Fehler beim Löschen des Dokuments ${id}:`, error);
            res.status(500).json({ message: 'Serverfehler beim Löschen des Dokuments.' });
        }
    });

    return router;
};