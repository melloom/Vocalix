import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Eye, User, Server, Globe, FileText, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PrivacyPolicy = () => {
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
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold">Privacy Policy</h1>
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
                Welcome to Vocalix ("we," "our," or "us"). We are committed to protecting your privacy and ensuring you have a positive experience on our platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our audio-first social platform.
              </p>
              <p>
                By using Vocalix, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our service.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Information We Collect
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Information You Provide</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li><strong>Profile Information:</strong> Your chosen handle, avatar, and any profile information you choose to share</li>
                  <li><strong>Audio Content:</strong> Voice clips, podcast segments, and other audio content you create and upload</li>
                  <li><strong>Interactions:</strong> Comments, reactions, follows, saves, and other engagement with content</li>
                  <li><strong>Communications:</strong> Messages sent through our direct messaging features</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Automatically Collected Information</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li><strong>Device Information:</strong> Device ID, device type, operating system, and browser information</li>
                  <li><strong>Usage Data:</strong> How you interact with our platform, features used, time spent, and navigation patterns</li>
                  <li><strong>Technical Data:</strong> IP address, access times, and error logs</li>
                  <li><strong>Location Data:</strong> General location information (if you choose to share it)</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                How We Use Your Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Provide, maintain, and improve our services</li>
                <li>Create and manage your account</li>
                <li>Enable you to create, share, and discover audio content</li>
                <li>Personalize your experience and content recommendations</li>
                <li>Facilitate communication between users</li>
                <li>Detect and prevent fraud, abuse, and security threats</li>
                <li>Comply with legal obligations and enforce our terms of service</li>
                <li>Send you notifications and updates about our service</li>
                <li>Analyze usage patterns to improve our platform</li>
              </ul>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Data Storage and Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We implement appropriate technical and organizational security measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
              </p>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Data Retention</h3>
                <p>
                  We retain your information for as long as your account is active or as needed to provide you services. You may delete your account at any time, which will result in the deletion of your profile information and content, subject to any legal retention requirements.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Information Sharing and Disclosure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Public Content:</strong> Content you choose to make public (voice clips, profile information) is visible to other users</li>
                <li><strong>Service Providers:</strong> We may share information with third-party service providers who perform services on our behalf (hosting, analytics, etc.)</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid legal requests</li>
                <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred</li>
                <li><strong>With Your Consent:</strong> We may share information with your explicit consent</li>
              </ul>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Your Privacy Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>Depending on your location, you may have certain rights regarding your personal information:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
                <li><strong>Opt-Out:</strong> Opt out of certain data processing activities</li>
                <li><strong>Objection:</strong> Object to processing of your personal information</li>
              </ul>
              <p>
                To exercise these rights, please contact us using the information provided in the "Contact Us" section below.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Children's Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Vocalix is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                International Data Transfers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using Vocalix, you consent to the transfer of your information to these countries.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Changes to This Privacy Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
              </p>
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
                If you have any questions about this Privacy Policy or our privacy practices, please contact us:
              </p>
              <div className="space-y-2">
                <p><strong>Vocalix</strong></p>
                <p>Email: privacy@vocalix.com</p>
                <p>For privacy-related inquiries, please include "Privacy Policy" in the subject line.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            This Privacy Policy is effective as of the date listed above and applies to all users of Vocalix.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

