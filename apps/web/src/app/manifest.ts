import type { MetadataRoute } from 'next';

/** Web app manifest: the name and icons a phone uses when AutomationDM is added to its home
 * screen, and the icon Android shows in its task switcher. Served at `/manifest.webmanifest`,
 * which src/proxy.ts lets through without a session - the browser fetches it with no cookies. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AutomationDM',
    short_name: 'AutomationDM',
    description: 'Instagram DM automation for creators and businesses.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e1220',
    theme_color: '#0e1220',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
