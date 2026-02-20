# ExpensesBot

Telegram expense tracker with receipt OCR, AI assistant, analytics, budgets, and exports.

## Features

- **Expense Tracking**: Manual entry and receipt photo OCR
- **AI Assistant**: Ask natural questions about spending (powered by DeepSeek)
- **Analytics**: Monthly reports, category breakdown
- **Budgets**: Set monthly limits per category with alerts
- **Recurring**: Track subscriptions and fixed expenses
- **Export**: Download expenses as CSV or PDF
- **Multi-User**: Per-user data isolation

## Quick Start

### Prerequisites
- Node.js 22+
- npm
- Telegram account (for bot)
- DeepSeek API key (for AI features)
- Google Vision API key (for receipt OCR)

### Local Development
```bash
# Install dependencies
npm install

# Create .env file with your keys
cp .env.example .env
# Edit .env with your actual keys

# Run in development mode
npm run dev
```

### Docker Deployment
```bash
# Local testing
docker-compose up -d

# Test health endpoint
curl http://localhost:5001/health

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production (Hetzner + Coolify)
Push to GitHub and connect via Coolify dashboard. Set Build Pack to Dockerfile.

Required environment variables in Coolify:
- `TELEGRAM_BOT_TOKEN`
- `DEEPSEEK_API_KEY`
- `GOOGLE_VISION_API_KEY`
- `DB_PATH` = `/data/expenses.db`
- `HEALTH_PORT` = `5001`
- `DEFAULT_CURRENCY` = `EUR`
- `RECEIPT_RETENTION_DAYS` = `90`

Persistent storage: mount `/data` volume for SQLite database.

## Bot Commands

### Basic
- `/start` - Welcome and commands
- `/stats` - Monthly spending report

### AI
- `/ai <question>` - Ask about your spending
  - Examples: "How much did I spend on food?", "What are my top categories?"

### Budgets
- `/budget list` - Show all budgets
- `/budget set <category> <amount>` - Set monthly budget
- `/budget delete <category>` - Remove budget

### Recurring
- `/recurring list` - Show active recurring expenses
- `/recurring add <name> <amount> <frequency>` - Add recurring
  - Frequencies: weekly, biweekly, monthly, quarterly, yearly

### Export
- `/export csv` - Download as CSV file
- `/export pdf` - Download as PDF report

### Manual Entry
Just send text in format: `<amount> <description>`
- Example: "20 coffee" saves as coffee expense

## Project Structure

```
src/
  index.ts              # Entry point
  config/               # Configuration and env
  services/
    database/           # SQLite operations
    telegram/           # Bot handler and buttons
    ai/                 # DeepSeek integration
    analytics/          # Reports and trends
    budget/             # Budget management
    recurring/          # Recurring expenses
    expense/            # Quick entry parsing
    export/             # CSV and PDF export
    receipt/            # OCR and receipt handling
    health/             # Health check server
    feedback/           # User messages
    state/              # User context state
    timezone/           # Timezone detection
  types/                # TypeScript types
  utils/                # Utilities
```

## Architecture

### Database
SQLite with WAL mode for concurrent access. Tables:
- `expenses` - Transactions with store name
- `items` - Line items from expenses
- `categories` - Spending categories
- `budget_limits` - Monthly budgets
- `recurring_expenses` - Fixed expenses
- `price_history` - Historical prices
- `receipt_photos` - Uploaded images
- `user_settings` - User preferences
- `user_patterns` - Learned patterns
- `user_context` - AI conversation context

All monetary amounts stored as BigInt (cents) for precision.

### API Integration
- **DeepSeek**: Natural language questions and receipt parsing (14400/day)
- **Google Vision**: Receipt OCR (1000/month free tier)
- **Telegram**: Bot communication (unlimited)

## Configuration

### Environment Variables
```env
# Telegram
TELEGRAM_BOT_TOKEN=          # From @BotFather

# AI
DEEPSEEK_API_KEY=            # From platform.deepseek.com

# OCR
GOOGLE_VISION_API_KEY=       # From Google Cloud Console

# Application
HEALTH_PORT=5001             # Health check port
DB_PATH=./data/expenses.db   # SQLite database file
DEFAULT_CURRENCY=EUR         # Default currency
RECEIPT_RETENTION_DAYS=90    # Auto-delete receipts after N days
```

## Development

### Build
```bash
npm run build
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
docker build -t expensesbot .

docker run -p 5001:5001 \
  -e TELEGRAM_BOT_TOKEN=xxx \
  -e DEEPSEEK_API_KEY=xxx \
  -v data:/data \
  expensesbot
```

### Docker Compose
```bash
docker-compose up -d
```

### Health Check
```bash
curl http://localhost:5001/health
```

## Security

- Parameterized SQL (injection-proof)
- Per-user data isolation
- Secrets in .env, never in code
- No sensitive data in logs
- Database in persistent volume
- Receipt auto-cleanup after 90 days

## Cost Estimation (Monthly)

| Component | Cost | Notes |
|-----------|------|-------|
| Hetzner VPS | ~3 EUR | CAX11, smallest tier |
| DeepSeek | ~0 EUR | Very low cost per query |
| Google Vision | 0 EUR | 1000/month free tier |
| **Total** | **~3 EUR** | For personal use |

## License

MIT

## Credits

Built with:
- [Grammy](https://grammy.dev) - Telegram bot framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Database
- [DeepSeek](https://deepseek.com) - AI assistant
- [pdfkit](http://pdfkit.org) - PDF generation
- [TypeScript](https://www.typescriptlang.org) - Type safety
