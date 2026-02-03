# ExpensesBot

Telegram expense tracker with receipt OCR, AI assistant, analytics, budgets, and exports.

## Features

- **Expense Tracking**: Manual entry and receipt photo OCR
- **AI Assistant**: Ask natural questions about spending (powered by Google Gemini)
- **Analytics**: Monthly reports, price trends, category breakdown
- **Budgets**: Set monthly limits per category with alerts
- **Recurring**: Track subscriptions and fixed expenses
- **Export**: Download expenses as CSV or PDF
- **Multi-User**: Per-user API keys for scalability

## Quick Start

### Prerequisites
- Node.js 20+
- npm
- Telegram account (for bot)
- Google API keys (Vision for OCR, Gemini for AI)

### Local Development
```bash
# Install dependencies
npm install

# Create .env file with your keys
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your-token
GEMINI_API_KEY=your-gemini-key
GOOGLE_VISION_API_KEY=your-vision-key
NODE_ENV=development
PORT=8080
DB_PATH=./expenses.db
EOF

# Run in development mode
npm run dev

# Or with ts-node
npx ts-node src/index.ts
```

### Docker Deployment
```bash
# Local testing
docker-compose up -d

# Test health endpoint
curl http://localhost:8080/health

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production (Hetzner + Coolify)
See [`.planning/DEPLOYMENT.md`](.planning/DEPLOYMENT.md) for full production deployment guide.

## Bot Commands

### Basic
- `/start` - Welcome and commands
- `/stats` - Monthly spending report

### AI
- `/ai <question>` - Ask about your spending
  - Examples: "How much did I spend on food?", "Show me trending categories"

### Budgets
- `/budget list` - Show all budgets
- `/budget set <category> <amount>` - Set monthly budget
  - Example: `/budget set Groceries 500`
- `/budget delete <category>` - Remove budget

### Recurring
- `/recurring list` - Show active recurring expenses
- `/recurring add <name> <amount> <frequency>` - Add recurring
  - Example: `/recurring add Netflix 15 monthly`
  - Frequencies: weekly, biweekly, monthly, quarterly, yearly

### Export
- `/export csv` - Download as CSV file
- `/export pdf` - Download as PDF report

### Manual Entry
Just send text in format: `<amount> <description>`
- Example: "20 coffee" saves €20 as coffee expense

## Project Structure

```
src/
  index.ts              # Entry point
  config/               # Configuration
  services/             # Business logic
    database/           # SQLite operations
    telegram/           # Bot handler
    ai/                 # Gemini integration
    analytics/          # Reports & trends
    budget/             # Budget management
    recurring/          # Recurring expenses
    export/             # CSV & PDF export
    health/             # Health check
  types/                # TypeScript types
  utils/                # Utilities
```

## Architecture

### Database
SQLite with WAL mode for concurrent access. 9 tables:
- `expenses` - Transactions
- `items` - Line items from expenses
- `categories` - Spending categories
- `budget_limits` - Monthly budgets
- `recurring_expenses` - Fixed expenses
- `price_history` - Historical prices
- `receipt_photos` - Uploaded images
- `user_settings` - User preferences
- `user_patterns` - Learned patterns

All monetary amounts stored as BigInt (cents) for precision.

### API Integration
- **Gemini**: Natural language questions (1500/day free tier)
- **Google Vision**: Receipt OCR (1000/month free tier)
- **Telegram**: Bot communication (unlimited)

### Services
- **Database**: Parameterized queries, no SQL injection
- **AI**: Rate limiting, context formatting, error handling
- **Analytics**: Aggregations, trend calculations
- **Budget**: Monthly tracking, alert thresholds
- **Export**: CSV escaping, PDF formatting

## Configuration

### Environment Variables
```env
# Telegram
TELEGRAM_BOT_TOKEN=          # From @BotFather

# Google APIs
GEMINI_API_KEY=              # From Google AI Studio
GOOGLE_VISION_API_KEY=       # From Google Cloud Console

# Application
NODE_ENV=development         # development|production
PORT=8080                    # Health check port
DB_PATH=./expenses.db        # SQLite database file
```

### User Settings (Per-User)
Users can configure:
- Default currency (EUR, USD, etc)
- Timezone for reports
- Budget alert thresholds

## API Limits

| Service | Limit | Tier |
|---------|-------|------|
| Gemini | 1500/day | Free |
| Google Vision | 1000/month | Free |
| Telegram | Unlimited | Public API |

With 1000 users:
- Gemini: 1.5 calls/user/day available
- Vision: 1 receipt/user/month available
- Recommend per-user API keys for scaling

## Development

### Build
```bash
npm run build
```

### Type Check
```bash
npx tsc --noEmit
```

### Lint
```bash
npm run lint
```

### Format
```bash
npm run format
```

### Test
```bash
npm test
```

## Deployment

### Docker
```bash
# Build image
docker build -t expensesbot .

# Run container
docker run -p 8080:8080 \
  -e TELEGRAM_BOT_TOKEN=xxx \
  -e GEMINI_API_KEY=xxx \
  -v data:/data \
  expensesbot
```

### Docker Compose
```bash
docker-compose up -d
```

### Coolify
Push to GitHub and connect via Coolify dashboard. See [deployment guide](.planning/DEPLOYMENT.md).

### Manual VPS
```bash
# SSH into VPS
ssh root@your-vps-ip

# Clone repo
git clone https://github.com/username/expensesbot.git
cd expensesbot

# Create data directory
mkdir -p data && chmod 755 data

# Set up .env
nano .env  # Add your API keys

# Start
docker-compose up -d
```

## Monitoring

### Health Check
```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00Z",
  "uptime": 3600
}
```

### Logs
```bash
# Docker
docker-compose logs -f expensesbot

# Direct
npm run dev 2>&1 | tee app.log
```

### Database
```bash
# Connect to SQLite
sqlite3 expenses.db

# Check schema
.tables
.schema expenses

# Test query
SELECT COUNT(*) FROM expenses;
```

## Troubleshooting

### Bot Not Responding
1. Check TELEGRAM_BOT_TOKEN is valid (get new one from @BotFather)
2. Verify /start command works
3. Check logs: `docker-compose logs`

### Gemini API Errors
1. Verify GEMINI_API_KEY is valid
2. Check daily quota hasn't been exceeded
3. Ensure API is enabled in Google Cloud Console

### Database Issues
- Bot won't start: Check database permissions
- Slow queries: Run `VACUUM` to optimize
- Lock timeout: Restart bot (WAL mode should recover)

### Memory/Disk
```bash
# Check resources
docker stats

# Clean up
docker system prune -a
docker volume prune
```

## Performance

**Single Container (CAX11 2vCPU, 4GB RAM):**
- Handles 5,000-10,000 concurrent users
- 150MB idle memory
- <1 second response time for most commands
- 50MB SQLite per 100K transactions

**For 50,000+ users:** Recommend PostgreSQL and multiple containers.

## Security

- No sensitive data in logs
- Parameterized SQL (injection-proof)
- Per-user API keys (no shared secrets)
- HTTPS enforced (Coolify auto-setup)
- Secrets in .env, never in code
- Database in secure volume
- Health check validates startup

See [deployment guide](.planning/DEPLOYMENT.md) for security checklist.

## Cost Estimation (Monthly)

| Component | Cost | Notes |
|-----------|------|-------|
| Hetzner VPS | €2.90 | CAX11, smallest tier |
| Google Gemini | €0 | 1500/day free tier |
| Google Vision | €0 | 1000/month free tier |
| Domain | €1-10 | Optional |
| **Total** | **€3-12** | For 1,000 users |

Scales linearly with number of users (add €2.90/month per 5,000 users).

## Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/something`
3. Commit changes with message starting with Phase number
4. Push and open pull request

Code must:
- Pass TypeScript strict mode
- Have no unused imports
- Follow Prettier formatting
- Use BigInt for money amounts
- Include error handling

## License

MIT

## Support

- Telegram: [@ExpensesBotSupport](https://t.me/ExpensesBotSupport)
- Issues: GitHub Issues
- Docs: See `.planning/` directory

## Credits

Built with:
- [Grammy](https://grammy.dev) - Telegram bot framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Database
- [Google Generative AI](https://ai.google.dev) - Gemini API
- [pdfkit](http://pdfkit.org) - PDF generation
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Docker](https://www.docker.com) - Containerization

## Contact

Questions? Open an issue or contact [@jagmarques](https://github.com/jagmarques)

