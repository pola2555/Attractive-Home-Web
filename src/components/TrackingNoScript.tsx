import { getTrackingSettings } from '@/lib/content';

// The <noscript> fallbacks for GTM (iframe) and, when used standalone, the Meta
// Pixel (img). Rendered as the first child of <body> so the GTM iframe sits where
// Google recommends. IDs come from getTrackingSettings (DB → env → '').
export default async function TrackingNoScript() {
  const { gtmId, metaPixelId } = await getTrackingSettings();
  if (!gtmId && !metaPixelId) return null;

  return (
    <>
      {gtmId && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="gtm"
          />
        </noscript>
      )}
      {metaPixelId && (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            alt=""
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
