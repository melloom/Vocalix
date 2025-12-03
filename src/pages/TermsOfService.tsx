import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Scale, Shield, Users, Mic, AlertTriangle, Ban, Gavel, Globe, Mail, Lock, Eye, Heart, Radio, MessageCircle, Music, Sparkles, DollarSign, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const TermsOfService = () => {
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
            <Scale className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold">Terms of Service</h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6" style={{ willChange: 'contents', transform: 'translateZ(0)' }}>
          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Welcome to Vocalix ("we," "our," "us," or "the Platform"). These Terms of Service ("Terms") govern your access to and use of Vocalix, an audio-first social platform that enables users to create, share, and discover voice-based content.
              </p>
              <p>
                By accessing or using Vocalix, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our service. These Terms apply to all users, visitors, and others who access or use the Platform.
              </p>
              <p>
                We may update these Terms from time to time. We will notify you of any material changes by posting the new Terms on this page and updating the "Last Updated" date. Your continued use of the Platform after such changes constitutes your acceptance of the new Terms.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Eligibility and Account Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Age Requirements</h3>
                <p>
                  You must be at least 13 years old to use Vocalix. If you are under 18, you represent that you have your parent's or guardian's permission to use the Platform. Users under 13 are not permitted to use Vocalix.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Creation</h3>
                <p>
                  Vocalix uses device-based authentication, which means you can create an account without providing an email address or phone number. You may choose a handle and avatar to identify yourself on the Platform. You are responsible for maintaining the security of your device and any authentication methods (such as PINs or magic links) you use to access your account.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Responsibility</h3>
                <p>
                  You are responsible for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account. We are not liable for any loss or damage arising from your failure to protect your account credentials or device.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Account Termination</h3>
                <p>
                  You may delete your account at any time through the Settings page. Upon account deletion, your profile information, content, and associated data will be permanently removed, subject to any legal retention requirements. We reserve the right to suspend or terminate accounts that violate these Terms.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                User Content and Conduct
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Content You Create</h3>
                <p>
                  You retain ownership of all content you create and upload to Vocalix, including voice clips, podcast segments, comments, reactions, and other materials ("User Content"). By posting User Content on Vocalix, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, distribute, display, and perform your User Content in connection with operating and providing the Platform.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Content Guidelines</h3>
                <p>You agree not to post, upload, or share content that:</p>
                <ul className="list-disc list-inside space-y-2 ml-2 mt-2">
                  <li>Violates any applicable law, regulation, or third-party right</li>
                  <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or invasive of privacy</li>
                  <li>Contains hate speech, discrimination, or incites violence</li>
                  <li>Infringes intellectual property rights, including copyrights, trademarks, or patents</li>
                  <li>Contains false or misleading information</li>
                  <li>Is spam, unsolicited advertising, or promotional material</li>
                  <li>Contains malware, viruses, or other harmful code</li>
                  <li>Impersonates another person or entity</li>
                  <li>Violates the privacy or publicity rights of others</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Content Moderation</h3>
                <p>
                  We reserve the right to review, moderate, remove, or disable access to any User Content that violates these Terms or our Community Guidelines. We may take these actions without prior notice and at our sole discretion. We are not obligated to monitor all User Content but may do so to ensure compliance with these Terms.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Adult Content</h3>
                <p>
                  Vocalix may contain adult-oriented content. Users must be at least 18 years old to access or create adult content. You are responsible for marking your content appropriately and complying with age verification requirements. We reserve the right to restrict access to adult content and require age verification.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Content Removal</h3>
                <p>
                  If you believe any content on Vocalix violates these Terms or infringes your rights, you may report it using our reporting features. We will review reports and take appropriate action. You may also delete your own content at any time, though cached or archived versions may persist for a limited period.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Platform Features and Services
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Clips and Content</h3>
                <p>
                  Vocalix allows you to create and share voice clips up to 30 seconds in length, or up to 10 minutes in Podcast Mode. All voice clips are automatically transcribed using AI technology. You may edit captions and transcriptions, but audio content cannot be edited after publication. You may delete your clips at any time.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Live Rooms</h3>
                <p>
                  Live Rooms enable real-time audio discussions. As a host, you are responsible for moderating your room and ensuring participants comply with these Terms. You may remove participants, end rooms, and manage speaker permissions. We are not responsible for the content of discussions in Live Rooms, but we reserve the right to monitor and moderate them.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Communities</h3>
                <p>
                  Communities are user-created groups focused on specific topics or interests. Community creators and moderators are responsible for enforcing community rules and these Terms within their communities. We may intervene in communities that violate these Terms or pose safety risks.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Reactions and Remixes</h3>
                <p>
                  You may create voice reactions (3-5 second clips) and remixes (duets) of other users' content. When creating remixes, you must respect the original creator's rights and provide proper attribution. Remixes must comply with these Terms and may not be used to harass, impersonate, or harm others.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Cloning</h3>
                <p>
                  Vocalix offers voice cloning features with strict ethical guidelines. Voice cloning requires explicit consent from the original voice owner. You may only clone voices with permission, and all cloned content must include proper attribution. Voice cloning may not be used to impersonate, deceive, or harm others. Violations may result in immediate account termination.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">AI Content Creation</h3>
                <p>
                  AI-powered features are provided for content creation assistance. You are responsible for all content created using AI tools, including ensuring it complies with these Terms. AI-generated content must be clearly labeled when required by our policies.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Direct Messages and Private Chats</h3>
                <p>
                  Private messaging features are provided for legitimate communication between users. You may not use messaging to spam, harass, or send unsolicited content. We may monitor messages for safety and compliance purposes, but we respect user privacy and only review messages when necessary.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Diary Feature</h3>
                <p>
                  The encrypted diary feature allows you to store private thoughts and entries. While we use encryption to protect your diary content, you are responsible for maintaining the security of your diary password or PIN. We cannot recover lost diary passwords.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Collections and Playlists</h3>
                <p>
                  You may create collections and playlists of voice clips. Collections may be public or private. You are responsible for ensuring you have the right to include content in your collections. Collections must comply with these Terms.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Offline Downloads</h3>
                <p>
                  You may download clips for offline listening. Downloaded content is stored locally on your device and is subject to your device's storage limitations. Downloaded content remains subject to these Terms and the original creator's rights.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Monetization and Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Creator Monetization</h3>
                <p>
                  Vocalix may offer monetization features that allow creators to earn revenue from their content. Participation in monetization programs is subject to separate terms and eligibility requirements. We reserve the right to modify, suspend, or terminate monetization features at any time.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Revenue Sharing</h3>
                <p>
                  When applicable, revenue sharing arrangements (such as voice cloning revenue sharing) are governed by separate agreements. Revenue sharing percentages and terms may vary and are subject to change with notice.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Payments</h3>
                <p>
                  If you make payments through Vocalix (for premium features, tips, or other services), you agree to provide accurate payment information and authorize us to charge your payment method. All payments are final unless otherwise stated. Refunds are subject to our refund policy.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Taxes</h3>
                <p>
                  You are responsible for any taxes, fees, or charges associated with your use of monetization features or payments. We may be required to collect and remit taxes in certain jurisdictions.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Intellectual Property
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Your Content</h3>
                <p>
                  You retain all ownership rights in your User Content. By posting User Content, you grant Vocalix a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, reproduce, distribute, prepare derivative works of, display, and perform your User Content in connection with the Platform and our business.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Platform Content</h3>
                <p>
                  The Platform, including its design, features, functionality, and content (excluding User Content), is owned by Vocalix and protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works of the Platform without our express written permission.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Copyright Infringement</h3>
                <p>
                  We respect intellectual property rights and expect our users to do the same. If you believe your copyright has been infringed, please contact us with a detailed notice including: (1) identification of the copyrighted work, (2) identification of the infringing material, (3) your contact information, (4) a statement of good faith, and (5) a statement of accuracy.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Trademarks</h3>
                <p>
                  "Vocalix" and related logos and marks are trademarks of Vocalix. You may not use our trademarks without our prior written consent.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Privacy and Data Protection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Your privacy is important to us. Our collection and use of your information is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using Vocalix, you consent to the collection and use of your information as described in our Privacy Policy.
              </p>
              <p>
                Key privacy features of Vocalix include device-based authentication, minimal data collection, and user control over content visibility. You can manage your privacy settings in the Settings page, including blocking users, controlling content visibility, and managing data sharing preferences.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Prohibited Activities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Use the Platform for any illegal purpose or in violation of any laws</li>
                <li>Harass, abuse, threaten, or harm other users</li>
                <li>Impersonate any person or entity or falsely claim affiliation with any person or entity</li>
                <li>Interfere with or disrupt the Platform or servers or networks connected to the Platform</li>
                <li>Use automated systems (bots, scrapers, etc.) to access the Platform without permission</li>
                <li>Attempt to gain unauthorized access to any portion of the Platform</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Platform</li>
                <li>Use the Platform to transmit viruses, malware, or other harmful code</li>
                <li>Collect or harvest information about other users without their consent</li>
                <li>Use the Platform to send spam, unsolicited messages, or promotional materials</li>
                <li>Violate any applicable export control laws</li>
                <li>Use voice cloning or AI features to deceive, impersonate, or harm others</li>
                <li>Circumvent or attempt to circumvent any security measures or access controls</li>
              </ul>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Disclaimers and Limitation of Liability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Service Availability</h3>
                <p>
                  Vocalix is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not guarantee that the Platform will be uninterrupted, error-free, or secure. We may modify, suspend, or discontinue any aspect of the Platform at any time.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Content Disclaimer</h3>
                <p>
                  We do not endorse, support, or guarantee the accuracy, completeness, or reliability of any User Content. You are solely responsible for your use of User Content and should verify information independently. We are not liable for any loss or damage resulting from your reliance on User Content.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Limitation of Liability</h3>
                <p>
                  To the maximum extent permitted by law, Vocalix and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, arising out of or related to your use of the Platform, even if we have been advised of the possibility of such damages.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Maximum Liability</h3>
                <p>
                  Our total liability to you for all claims arising out of or related to your use of the Platform shall not exceed the amount you paid us in the twelve (12) months preceding the claim, or $100, whichever is greater.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Indemnification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                You agree to indemnify, defend, and hold harmless Vocalix and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys' fees) arising out of or in any way connected with: (1) your use of the Platform, (2) your User Content, (3) your violation of these Terms, (4) your violation of any third-party right, or (5) your violation of any applicable law.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Governing Law and Dispute Resolution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Governing Law</h3>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Vocalix operates, without regard to its conflict of law provisions.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Dispute Resolution</h3>
                <p>
                  Any disputes arising out of or relating to these Terms or the Platform shall be resolved through binding arbitration in accordance with the rules of a recognized arbitration organization, except where prohibited by law. You waive any right to a jury trial or to participate in a class action lawsuit.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Jurisdiction</h3>
                <p>
                  If arbitration is not available or is prohibited by law, you agree that any legal action shall be brought in the courts located in the jurisdiction where Vocalix operates.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Termination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Termination by You</h3>
                <p>
                  You may terminate your account at any time by deleting it through the Settings page. Upon termination, your access to the Platform will cease, and your User Content will be deleted in accordance with our data retention policies.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Termination by Us</h3>
                <p>
                  We may suspend or terminate your account immediately, without prior notice, if you violate these Terms, engage in fraudulent or illegal activity, or for any other reason we deem necessary to protect the Platform or other users. We are not obligated to provide a reason for termination.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Effect of Termination</h3>
                <p>
                  Upon termination, your right to use the Platform will immediately cease. Provisions of these Terms that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                General Provisions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Entire Agreement</h3>
                <p>
                  These Terms, together with our Privacy Policy, constitute the entire agreement between you and Vocalix regarding your use of the Platform and supersede all prior agreements.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Severability</h3>
                <p>
                  If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Waiver</h3>
                <p>
                  Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Assignment</h3>
                <p>
                  You may not assign or transfer these Terms or your account without our prior written consent. We may assign these Terms without restriction.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Changes to Terms</h3>
                <p>
                  We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on this page and updating the "Last Updated" date. Your continued use of the Platform after changes become effective constitutes acceptance of the new Terms.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="space-y-2">
                <p><strong>Vocalix</strong></p>
                <p>Email: legal@vocalix.com</p>
                <p>For legal inquiries, please include "Terms of Service" in the subject line.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            These Terms of Service are effective as of the date listed above and apply to all users of Vocalix. By using Vocalix, you acknowledge that you have read, understood, and agree to be bound by these Terms.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;

