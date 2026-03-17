import { defineConfig } from 'prisma/config'

export default defineConfig({
  client: {
    adapter: {
      libsql: {
        url: process.env.DATABASE_URL || 'file:database.db',
      },
    },
  },
})
