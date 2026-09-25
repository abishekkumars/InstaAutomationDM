/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dev-only route badge sits in a corner, and on the mobile view every corner holds a control:
  // the tab bar's Listing/Settings at the bottom, Back and the search icon at the top. It covered
  // the Listing tab and swallowed taps (the Phase 18.6 browser tests caught it). Compile and
  // runtime errors are still shown with it off.
  devIndicators: false,
};

export default nextConfig;
