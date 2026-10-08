// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL;

export default defineConfig({
  site,
  output: 'static',
  integrations: [
    {
      name: 'require-site-url',
      hooks: {
        'astro:config:setup': ({ command }) => {
          // The link card needs an absolute og:image URL. Dev takes it from the open page.
          if (command === 'build' && !site) {
            console.error('SITE_URL is required to build the link card (absolute og:image URL).');
            process.exit(1);
          }
        },
      },
    },
  ],
});
