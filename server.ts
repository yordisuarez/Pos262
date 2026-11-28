import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = Number(process.env.PORT) || 3000;

  // Backend Proxy Routes for Cashea API (keeping private key secure on server)
  app.post('/api/cashea/orders/:idNumber/down-payment', async (req, res) => {
    try {
      const { idNumber } = req.params;
      const privateKey = process.env.CASHEA_PRIVATE_KEY || process.env.PRIVATE_KEY || '';

      const response = await fetch(`https://external.cashea.app/orders/${idNumber}/down-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${privateKey}`,
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  app.delete('/api/cashea/orders/:idNumber', async (req, res) => {
    try {
      const { idNumber } = req.params;
      const privateKey = process.env.CASHEA_PRIVATE_KEY || process.env.PRIVATE_KEY || '';

      const response = await fetch(`https://external.cashea.app/orders/${idNumber}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `ApiKey ${privateKey}`,
        },
      });

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
