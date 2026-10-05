import '../utils/vercelRuntime.js'; // must stay first: sets env the modules below read on load
import { app } from '../index.js';
import { connectDB } from '../db.js';
import { assertProductionConfig } from '../utils/productionConfig.js';
import { syncVectraIndex } from '../utils/ragEngine.js';

export default async function handler(req, res) {
  try {
    // Checkout validates its own credentials; travel APIs only need core services.
    assertProductionConfig(process.env, { requirePayments: false });
    await connectDB();
    await syncVectraIndex();
  } catch (error) {
    console.error('Deployment initialization failed:', error.message);
    return res.status(503).json({ error: 'Service unavailable. Please try again.' });
  }
  return app(req, res);
}
