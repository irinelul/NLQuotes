const express = require('express');
const path = require('path');

const app = express();
const distPath = path.join(__dirname, 'dist'); // Adjust if your build output is elsewhere

// Serve static files from dist
app.use(express.static(distPath));

// For any other route, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 