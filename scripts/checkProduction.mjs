import 'dotenv/config';
import { productionIssues } from '../utils/productionConfig.js';
const issues = productionIssues();
console.log(JSON.stringify({ ready: issues.length === 0, issues, note: 'Configuration check only; does not validate remote credentials or charge a payment.' }, null, 2));
process.exitCode = issues.length ? 1 : 0;
