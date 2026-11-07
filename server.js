import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve frontend files
app.use(express.static('public'));

// First API endpoint
app.get('/api/health', (req, res) => {
    res.json({
        message: 'MyBookShelf API is running!',
        status: 'success'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`MyBookShelf running at http://localhost:${PORT}`);
});