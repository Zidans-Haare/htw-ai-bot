const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create a cache directory if it doesn't exist
const cacheDir = path.resolve(__dirname, '..', '..', 'cache', 'uploads'); // Store cached resizes under project root cache/uploads
const imagesDir = path.resolve(__dirname, '..', '..', 'uploads', 'images');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const processingPromises = new Map();

module.exports = (app) => {
  app.get('/uploads/images/:filename', async (req, res) => {
    const { filename } = req.params;
    const match = filename.match(/^(.+)_(\d+)px(\.\w+)?$/);
    if (!match) {
      // Serve original if no size specified
      return res.sendFile(path.resolve(imagesDir, filename), (err) => {
        if (err && !res.headersSent) res.status(404).send('Image not found');
      });
    }

    const [_, baseName, widthStr, ext] = match;
    const width = parseInt(widthStr, 10);
    const requestedExt = ext || '';
    const originalPath = path.resolve(imagesDir, `${baseName}${requestedExt}`);
    const cachePath = path.join(cacheDir, filename);

    if (!fs.existsSync(originalPath)) {
      if (!res.headersSent) return res.status(404).send('Original image not found');
      return;
    }

    // Check cache
    if (fs.existsSync(cachePath)) {
      return res.sendFile(cachePath);
    }

    // --- Promise-based locking mechanism ---
    if (processingPromises.has(filename)) {
      // If image is being processed, wait for it to complete
      try {
        await processingPromises.get(filename);
        // After waiting, check cache again
        if (fs.existsSync(cachePath)) {
          return res.sendFile(cachePath);
        }
      } catch (error) {
        // If the processing failed, we can try again
        console.log(`Previous processing failed for ${filename}, retrying...`);
      }
    }

    // Create a new processing promise
    const processingPromise = (async () => {
      try {
        // Get metadata to determine actual format and dimensions
        const metadata = await sharp(originalPath).metadata();
        const originalFormat = metadata.format ? metadata.format.toLowerCase() : null;
        const originalWidth = metadata.width;

        // If original image is smaller or equal to requested width, serve original
        if (originalWidth <= width) {
          // Cache the original image for future requests
          fs.copyFileSync(originalPath, cachePath);
          return;
        }

        // Start sharp pipeline
        let imageSharp = sharp(originalPath).resize({ width });

        let outputFormat;

        switch (originalFormat) {
          case 'jpeg':
          case 'jpg':
            imageSharp = imageSharp.jpeg();
            outputFormat = 'jpeg';
            break;
          case 'png':
            imageSharp = imageSharp.png();
            outputFormat = 'png';
            break;
          case 'gif':
            imageSharp = imageSharp.gif();
            outputFormat = 'gif';
            break;
          case 'webp':
            imageSharp = imageSharp.webp();
            outputFormat = 'webp';
            break;
          case 'svg':
            imageSharp = imageSharp.png();
            outputFormat = 'png';
            break;
          default:
            // Fallback to JPEG for unsupported formats
            imageSharp = imageSharp.jpeg();
            outputFormat = 'jpeg';
        }

        const buffer = await imageSharp.toBuffer();

        // Cache the resized image
        fs.writeFileSync(cachePath, buffer);

      } catch (error) {
        console.error('Image resize error:', error);
        throw error; // Re-throw to be caught by the caller
      }
    })();

    processingPromises.set(filename, processingPromise);

    try {
      await processingPromise;

      // After processing is complete, serve the cached image
      if (fs.existsSync(cachePath)) {
        return res.sendFile(cachePath);
      } else {
        if (!res.headersSent) res.status(500).send('Image processing failed');
      }
    } catch (error) {
      console.error('Image processing failed:', error);
      if (!res.headersSent) res.status(500).send('Error processing image');
    } finally {
      // Clean up the promise
      processingPromises.delete(filename);
    }
  });

  // Public endpoint to get image metadata (source, description)
  app.get('/api/public/images/:filename/meta', async (req, res) => {
    const { filename } = req.params;
    try {
      // We need to access the DB here. Since this controller is initialized in server.cjs
      // where prisma is available via require('./controllers/db.cjs'), we can import it here.
      const { prisma } = require('./db.cjs');

      const image = await prisma.images.findUnique({
        where: { filename },
        select: { source: true, description: true }
      });

      if (!image) {
        return res.status(404).json({ message: 'Image not found' });
      }

      res.json(image);
    } catch (error) {
      console.error('Error fetching image metadata:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });
};
