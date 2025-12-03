import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cookie, Shield, Settings, Database, Globe, AlertCircle, Info, X, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const CookiePolicy = () => {
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              className="rounded-full hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Cookie className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold">Cookie Policy</h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6" style={{ willChange: 'contents', transform: 'translateZ(0)' }}>
          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Welcome to Vocalix ("we," "our," or "us"). This Cookie Policy explains how we use cookies, local storage, and similar tracking technologies when you visit our audio-first social platform. This policy should be read alongside our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>
              <p>
                As an audio-first platform where voice is the primary medium of expression, we use various technologies to ensure your experience is secure, personalized, and functional. This policy explains what these technologies are, why we use them, and your choices regarding their use.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cookie className="h-5 w-5" />
                What Are Cookies and Similar Technologies?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Cookies are small text files that are placed on your device when you visit a website. We also use similar technologies such as:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Local Storage:</strong> Data stored in your browser that persists across sessions</li>
                <li><strong>Session Storage:</strong> Temporary data stored for the duration of your browser session</li>
                <li><strong>IndexedDB:</strong> A database in your browser for storing larger amounts of data</li>
                <li><strong>Device Identifiers:</strong> Unique identifiers to recognize your device</li>
              </ul>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Types of Cookies We Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Essential Cookies (Strictly Necessary)
                </h3>
                <p className="mb-2">
                  These cookies are essential for the platform to function and cannot be disabled. They are usually set in response to actions you take, such as logging in or setting privacy preferences.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <p className="font-medium text-foreground mb-1">Session Authentication Cookie</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Name:</strong> echo_session</li>
                      <li><strong>Purpose:</strong> Maintains your login session across browser tabs and sessions</li>
                      <li><strong>Duration:</strong> 30 days (or until you log out)</li>
                      <li><strong>Type:</strong> HTTP-only cookie (secure, cannot be accessed by JavaScript)</li>
                      <li><strong>Why Essential:</strong> Required for cross-browser authentication and secure access to your account</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Device Identifier</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Storage:</strong> localStorage, sessionStorage, and IndexedDB</li>
                      <li><strong>Purpose:</strong> Identifies your device for account creation and authentication</li>
                      <li><strong>Duration:</strong> Persistent until cleared</li>
                      <li><strong>Why Essential:</strong> Enables device-based authentication without requiring email or phone numbers</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">UI Preferences</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Name:</strong> sidebar:state, echo-garden-theme</li>
                      <li><strong>Purpose:</strong> Remembers your sidebar state and theme preferences</li>
                      <li><strong>Duration:</strong> 7 days (sidebar), persistent (theme)</li>
                      <li><strong>Why Essential:</strong> Provides a consistent user experience across sessions</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Functional Cookies
                </h3>
                <p className="mb-2">
                  These cookies enable enhanced functionality and personalization but are not essential for the platform to work.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <p className="font-medium text-foreground mb-1">User Preferences</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Storage:</strong> localStorage and database</li>
                      <li><strong>Purpose:</strong> Stores your feed preferences, audio quality settings, playback speed, and personalization data</li>
                      <li><strong>Duration:</strong> Persistent until you change or delete them</li>
                      <li><strong>Why Used:</strong> Personalizes your experience and remembers your settings</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Offline Data</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Storage:</strong> IndexedDB and Cache API</li>
                      <li><strong>Purpose:</strong> Caches audio clips and content for offline playback</li>
                      <li><strong>Duration:</strong> Until cache is cleared or storage limit reached</li>
                      <li><strong>Why Used:</strong> Enables offline listening and faster content loading</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Analytics and Performance Cookies
                </h3>
                <p className="mb-2">
                  These cookies help us understand how visitors interact with our platform, identify errors, and improve performance.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <p className="font-medium text-foreground mb-1">Sentry Error Tracking</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Provider:</strong> Sentry.io</li>
                      <li><strong>Purpose:</strong> Tracks errors, performance issues, and helps us fix bugs</li>
                      <li><strong>Data Collected:</strong> Error messages, stack traces, browser information, performance metrics</li>
                      <li><strong>Session Replay:</strong> Records user sessions (10% of sessions, 100% of error sessions) to help debug issues</li>
                      <li><strong>Duration:</strong> Varies (see Sentry's privacy policy)</li>
                      <li><strong>Opt-Out:</strong> You can disable this in your cookie preferences</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">Performance Monitoring</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Purpose:</strong> Tracks page load times, API response times, and user interactions</li>
                      <li><strong>Data Collected:</strong> Performance metrics, navigation patterns, feature usage</li>
                      <li><strong>Duration:</strong> Aggregated data retained for analytics purposes</li>
                      <li><strong>Why Used:</strong> Helps us optimize the platform for better performance</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Security and Anti-Abuse Cookies
                </h3>
                <p className="mb-2">
                  These cookies help protect our platform and users from abuse, spam, and security threats.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <p className="font-medium text-foreground mb-1">Google reCAPTCHA</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                      <li><strong>Provider:</strong> Google LLC</li>
                      <li><strong>Purpose:</strong> Protects against spam, bots, and abuse during account creation and certain actions</li>
                      <li><strong>Data Collected:</strong> IP address, browser information, interaction patterns</li>
                      <li><strong>Duration:</strong> Session-based and persistent cookies (see Google's privacy policy)</li>
                      <li><strong>Why Used:</strong> Essential for maintaining platform security and preventing abuse</li>
                      <li><strong>Privacy:</strong> Subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google's Privacy Policy</a></li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                How We Use Cookies on Vocalix
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>Given that Vocalix is an audio-first platform with unique features, we use cookies and similar technologies to:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Authentication:</strong> Maintain your login session across devices and browser tabs</li>
                <li><strong>Audio Playback:</strong> Remember your playback preferences (speed, quality, position)</li>
                <li><strong>Offline Functionality:</strong> Cache audio content for offline listening</li>
                <li><strong>Personalization:</strong> Customize your feed based on your listening patterns and preferences</li>
                <li><strong>Security:</strong> Protect against spam, bots, and unauthorized access</li>
                <li><strong>Performance:</strong> Monitor and improve platform performance and fix bugs</li>
                <li><strong>User Experience:</strong> Remember your UI preferences, theme, and settings</li>
                <li><strong>Analytics:</strong> Understand how users interact with voice content and features</li>
              </ul>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Third-Party Cookies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We work with trusted third-party service providers who may set cookies on your device:
              </p>
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-foreground mb-2">Sentry (sentry.io)</p>
                  <p className="text-xs">
                    Used for error tracking and performance monitoring. Sentry may set cookies to track errors and session replays. 
                    <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">View Sentry's Privacy Policy</a>
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-2">Google reCAPTCHA (google.com)</p>
                  <p className="text-xs">
                    Used for security and spam prevention. Google may set cookies to verify you're human. 
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">View Google's Privacy Policy</a>
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-2">Supabase (supabase.com)</p>
                  <p className="text-xs">
                    Our backend infrastructure provider. Supabase may use cookies for authentication and service functionality. 
                    <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">View Supabase's Privacy Policy</a>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Managing Your Cookie Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                You have control over cookies and similar technologies. However, please note that disabling certain cookies may impact your experience on Vocalix.
              </p>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Cookie Banner</h3>
                <p className="mb-2">
                  When you first visit Vocalix, you'll see a cookie banner where you can:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li><strong>Accept All:</strong> Enable all cookies including analytics</li>
                  <li><strong>Reject All:</strong> Only allow essential cookies</li>
                  <li><strong>Customize:</strong> Choose which types of cookies to allow</li>
                </ul>
                <p className="mt-3 text-xs">
                  You can change your preferences at any time by clicking the cookie settings link in the footer or by clearing your browser's cookie data.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Browser Settings</h3>
                <p className="mb-2">
                  Most browsers allow you to control cookies through their settings. You can:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Block all cookies</li>
                  <li>Block third-party cookies</li>
                  <li>Delete cookies when you close your browser</li>
                  <li>Delete specific cookies</li>
                </ul>
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  <strong>Note:</strong> Blocking essential cookies (like session cookies) will prevent you from logging in or using many features of Vocalix.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Local Storage and IndexedDB</h3>
                <p className="mb-2">
                  You can clear local storage and IndexedDB data through your browser's developer tools or privacy settings:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-2 text-xs">
                  <li><strong>Chrome/Edge:</strong> Settings → Privacy → Clear browsing data → Cached images and files</li>
                  <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data → Clear Data</li>
                  <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <p className="font-semibold text-foreground mb-2">Essential Cookies Cannot Be Disabled</p>
                <p className="text-xs">
                  Essential cookies (like session authentication) are required for Vocalix to function. If you disable these, you will not be able to log in or use most features of the platform.
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-2">Audio-First Platform Considerations</p>
                <p className="mb-2">
                  As an audio-first platform, we use cookies and storage to:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                  <li>Cache audio files for faster playback and offline access</li>
                  <li>Remember playback positions across sessions</li>
                  <li>Store audio quality preferences</li>
                  <li>Enable background audio playback</li>
                  <li>Support voice recording and processing</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-2">Device-Based Authentication</p>
                <p className="text-xs">
                  Vocalix uses device identifiers stored in localStorage, sessionStorage, and IndexedDB for authentication. This allows you to use the platform without providing an email or phone number. These identifiers are essential for account creation and login.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Updates to This Cookie Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by posting the new Cookie Policy on this page and updating the "Last Updated" date.
              </p>
              <p>
                We encourage you to review this Cookie Policy periodically to stay informed about how we use cookies and similar technologies.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you have any questions about this Cookie Policy or our use of cookies, please contact us:
              </p>
              <div className="space-y-2">
                <p><strong>Vocalix</strong></p>
                <p>Email: privacy@vocalix.com</p>
                <p>For cookie-related inquiries, please include "Cookie Policy" in the subject line.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            This Cookie Policy is effective as of the date listed above and applies to all users of Vocalix.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/privacy">Privacy Policy</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Clear cookie consent to show banner again
                localStorage.removeItem('vocalix_cookie_consent');
                window.location.reload();
              }}
            >
              Update Cookie Preferences
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;

