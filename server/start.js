import dotenv from 'dotenv';
import app from './index.js';

dotenv.config({ path: ['.env.local', '.env'] });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Cargo API listening on http://localhost:${port}`));
