import Script from 'next/script';
import { getTrackingSettings } from '@/lib/content';

// Marketing tracking — GTM-first, matching the old site's architecture: a single
// Google Tag Manager container drives GA4 + Meta Pixel + Ads (configured inside
// GTM), so adding a destination is a GTM change, not a redeploy. Consent Mode v2
// defaults run before GTM (all granted — UAE has no cookie-consent requirement;
// change here if that ever changes). A hostname gate keeps localhost/preview from
// polluting real data. Direct GA4 / Meta Pixel tags are fallbacks for when they
// are NOT managed in GTM. IDs come from getTrackingSettings (DB → env → '').

// Production host for the runtime gate, derived from NEXT_PUBLIC_SITE_URL.
function prodHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const CONSENT_DEFAULTS = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted',functionality_storage:'granted',personalization_storage:'granted',security_storage:'granted'});`;

export default async function TrackingScripts() {
  const { gtmId, ga4Id, metaPixelId } = await getTrackingSettings();
  const host = prodHost();
  // Runtime gate string: allow only the prod host (and its subdomains). Empty
  // host = no gate (still loads) — only happens if NEXT_PUBLIC_SITE_URL is unset.
  const gate = `var h=location.hostname,g=${JSON.stringify(host)};if(g&&h!==g&&!h.endsWith('.'+g))return;`;

  return (
    <>
      {gtmId ? (
        // Consent defaults + gated GTM loader, one script so order is guaranteed.
        <Script id="gtm-init" strategy="afterInteractive">
          {`${CONSENT_DEFAULTS}
(function(w,d,s,l,i){${gate}w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtmId)});`}
        </Script>
      ) : ga4Id ? (
        // Direct GA4 fallback — only when GTM is not configured (avoids double-count).
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`${CONSENT_DEFAULTS}
gtag('js',new Date());gtag('config',${JSON.stringify(ga4Id)});`}
          </Script>
        </>
      ) : null}

      {metaPixelId && (
        // Standalone Meta Pixel — only if NOT managed inside GTM.
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
