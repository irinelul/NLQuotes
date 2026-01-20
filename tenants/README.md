# Multi-Tenant Configuration

This application supports multiple tenants, each with their own branding, metadata, texts, and database connections.

## Adding a New Tenant

1. Create a new JSON file in the `tenants/` directory (e.g., `tenants/mytenant.json`)

2. Use the following structure:

```json
{
  "id": "mytenant",
  "name": "My Tenant",
  "displayName": "MyQuotes",
  "hostnames": ["myquotes.com", "www.myquotes.com"],
  
  "branding": {
    "logo": "/mytenant-logo.svg",
    "logoFallback": "/mytenant-logo.png",
    "favicon": "/mytenant-favicon.svg",
    "primaryColor": "#FF5733",
    "theme": "mytenant"
  },
  
  "metadata": {
    "title": "MyQuotes - Search Quotes",
    "description": "Search through thousands of quotes.",
    "keywords": "quotes, search, videos",
    "ogImage": "/mytenant-og.png",
    "siteName": "MyQuotes"
  },
  
  "texts": {
    "searchPlaceholder": "Search quotes...",
    "randomQuotesButton": "Random Quotes",
    "footerText": "Made with passion by a fan",
    "disclaimer": "This site is not affiliated with...",
    "totalQuotesLabel": "Total quotes found:",
    "noResultsMessage": "No quotes found.",
    "loadingMessage": "Loading...",
    "errorMessage": "Unable to connect to database."
  },
  
  "channels": [
    { "id": "all", "name": "All Sources" },
    { "id": "channel1", "name": "Channel 1" },
    { "id": "channel2", "name": "Channel 2" }
  ],
  
  "database": {
    "envVar": "MYTENANT_DATABASE_URL",
    "description": "PostgreSQL database for quotes"
  }
}
```

3. Set the environment variable for the tenant's database:
   - Add `MYTENANT_DATABASE_URL=postgres://...` to your `.env` file
   - Or set it in your deployment environment

4. Deploy the tenant config file and restart the server

## Tenant Detection

Tenants are detected automatically based on the request hostname. The system:
1. Checks for an exact hostname match
2. Falls back to wildcard matching (e.g., `*.example.com`)
3. Falls back to the default tenant (`northernlion`)

## Database Configuration

- Each tenant can have its own PostgreSQL database for quotes
- Analytics always uses the shared `ANALYTICS_DATABASE_URL`
- If a tenant doesn't specify a database env var, it falls back to `DATABASE_URL`

## Frontend Integration

The frontend automatically fetches tenant configuration from `/api/tenant` and:
- Updates page title and meta tags
- Updates favicon
- Uses tenant-specific logos, texts, and branding
- All components use the `useTenant()` hook to access tenant config
