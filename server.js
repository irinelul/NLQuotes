import express from 'express';
import { createServer as createViteServer } from 'vite';
import compression from 'compression';

async function createServer() {
  const app = express();
  
  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });

  // Use compression middleware
  app.use(compression());
  
  // Use Vite's connect instance as middleware
  app.use(vite.middlewares);

  app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
  });
}

createServer(); 