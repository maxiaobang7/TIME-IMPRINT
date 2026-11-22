/**
 * HTTPS address of the handwriting font used by 「旅行明信片」 and 「拍立得」.
 * Use a TTF or WOFF file (WOFF2 fails on older iOS) and add its domain to the
 * mini program's downloadFile domain list. Left empty, those templates fall
 * back to the phone's serif font.
 * Example: "https://your-domain/fonts/MaShanZheng-Regular.ttf"
 */
export const HAND_FONT_URL = "";

/**
 * Address of the website version, shown at the bottom of the home page with a
 * copy button. Mini programs can't open outside links, so people copy it into
 * a browser. Left empty, only the hint text is shown.
 * Example: "https://your-domain/"
 */
export const WEB_URL = "https://imprint.maxiaobang.com/";

/**
 * Where the large template examples on the home page are loaded from. The
 * package only holds small previews: WeChat flags packages whose images add up
 * to more than 200 KB. The files live in the website's public/mp/templates/;
 * until the website is deployed with them, the home page shows the small preview.
 */
export const EXAMPLE_IMAGE_BASE = `${WEB_URL}mp/templates/`;
