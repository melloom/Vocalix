import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Scale, Shield, AlertTriangle, Mail, Copyright, Gavel, FileCheck, XCircle, CheckCircle, AlertCircle, Info, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const DMCAPolicy = () => {
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
            <Copyright className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold">DMCA Copyright Policy</h1>
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
                Vocalix ("we," "our," or "us") respects the intellectual property rights of others and expects our users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 ("DMCA"), we have implemented procedures for receiving written notification of claimed copyright infringement and for processing such claims in accordance with the DMCA.
              </p>
              <p>
                This DMCA Copyright Policy applies to all content on Vocalix, including but not limited to voice clips, audio recordings, podcast segments, remixes, voice reactions, transcriptions, and any other user-generated audio content.
              </p>
              <p>
                If you are a copyright owner or an authorized agent thereof, and you believe that any content on Vocalix infringes your copyrights, you may submit a notification pursuant to the DMCA by providing our designated Copyright Agent with the information described below.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Reporting Copyright Infringement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you believe that content on Vocalix infringes your copyright, please provide our Copyright Agent with a written notice containing the following information:
              </p>
              
              <div className="space-y-4 mt-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    1. Identification of the Copyrighted Work
                  </h3>
                  <p>
                    A description of the copyrighted work that you claim has been infringed, including:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                    <li>The title of the work</li>
                    <li>The author/composer/performer of the work</li>
                    <li>Registration number (if applicable)</li>
                    <li>A copy of or link to the original work</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    2. Identification of the Infringing Material
                  </h3>
                  <p>
                    Information sufficient to permit us to locate the allegedly infringing material on Vocalix, including:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                    <li>The URL(s) or direct link(s) to the specific voice clip(s) or content</li>
                    <li>The handle or username of the user who posted the content</li>
                    <li>The title or description of the clip (if available)</li>
                    <li>The date and time the content was posted (if known)</li>
                    <li>Any other information that will help us locate the content</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    3. Your Contact Information
                  </h3>
                  <p>Your full name, mailing address, telephone number, and email address.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    4. Statement of Good Faith Belief
                  </h3>
                  <p>
                    A statement that you have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    5. Statement of Accuracy
                  </h3>
                  <p>
                    A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Gavel className="h-4 w-4" />
                    6. Physical or Electronic Signature
                  </h3>
                  <p>
                    Your physical or electronic signature (typed name is sufficient for electronic signatures).
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
                <p className="font-semibold text-foreground mb-2">Important Notes:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                  <li>Please provide as much detail as possible to help us process your request quickly</li>
                  <li>False or fraudulent notifications may result in liability for damages</li>
                  <li>We may share your notification with the user who posted the allegedly infringing content</li>
                  <li>We may also share your notification with third parties, including the Lumen database</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Designated Copyright Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Please send your DMCA takedown notice to our designated Copyright Agent:
              </p>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
                <p className="font-semibold text-foreground mb-2">Vocalix Copyright Agent</p>
                <p className="mb-1"><strong>Email:</strong> copyright@vocalix.com</p>
                <p className="mb-1"><strong>Subject Line:</strong> DMCA Takedown Notice</p>
                <p className="text-xs mt-3 text-muted-foreground">
                  For fastest processing, please include "DMCA Takedown Notice" in the subject line of your email.
                </p>
              </div>
              <p className="text-sm">
                <strong>Note:</strong> We only accept DMCA notices via email. Physical mail notices will not be processed. If you send a physical mail notice, we may not receive it in time to take action.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                What Happens After We Receive Your Notice?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>Upon receipt of a valid DMCA takedown notice, we will:</p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>
                  <strong>Review the notice</strong> to ensure it contains all required information and appears to be valid
                </li>
                <li>
                  <strong>Remove or disable access</strong> to the allegedly infringing content promptly (typically within 24-48 hours of receipt of a valid notice)
                </li>
                <li>
                  <strong>Notify the user</strong> who posted the content that it has been removed and provide them with a copy of your takedown notice
                </li>
                <li>
                  <strong>Provide the user</strong> with information about how to file a counter-notification if they believe the removal was a mistake
                </li>
                <li>
                  <strong>Keep records</strong> of the takedown notice and our actions in accordance with DMCA requirements
                </li>
              </ol>
              <div className="mt-4 p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm font-semibold text-foreground mb-2">
                  <Info className="h-4 w-4 inline mr-1" />
                  Processing Time
                </p>
                <p className="text-sm">
                  We typically process valid DMCA takedown notices within 24-48 hours. However, complex cases or incomplete notices may take longer. We will acknowledge receipt of your notice via email.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Counter-Notification Procedure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you believe that your content was removed in error, you may submit a counter-notification to our Copyright Agent. Your counter-notification must include:
              </p>
              
              <div className="space-y-3 mt-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">1. Identification of Removed Content</h3>
                  <p>Description of the content that was removed and the location where it appeared before removal.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">2. Statement Under Penalty of Perjury</h3>
                  <p>
                    A statement, under penalty of perjury, that you have a good faith belief that the content was removed or disabled as a result of mistake or misidentification.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">3. Consent to Jurisdiction</h3>
                  <p>
                    A statement that you consent to the jurisdiction of the federal court in the district where you are located (or if outside the United States, the jurisdiction of the courts where Vocalix operates), and that you will accept service of process from the person who provided the original takedown notice.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">4. Your Contact Information</h3>
                  <p>Your name, address, telephone number, and email address.</p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-2">5. Physical or Electronic Signature</h3>
                  <p>Your physical or electronic signature.</p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-sm font-semibold text-foreground mb-2">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Important Warning
                </p>
                <p className="text-sm">
                  Filing a false counter-notification is a serious matter. If you file a counter-notification, the original complainant will be notified and may file a lawsuit against you. If we receive a valid counter-notification, we may restore the content within 10-14 business days unless the original complainant files a court action.
                </p>
              </div>

              <div className="mt-4">
                <p className="font-semibold text-foreground mb-2">Send Counter-Notifications To:</p>
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <p><strong>Email:</strong> copyright@vocalix.com</p>
                  <p className="mt-1"><strong>Subject Line:</strong> DMCA Counter-Notification</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Repeat Infringer Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                In accordance with the DMCA and our Terms of Service, we maintain a policy of terminating, in appropriate circumstances, the accounts of users who are repeat infringers of intellectual property rights.
              </p>
              <p>
                A user may be considered a "repeat infringer" if:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>We receive multiple valid DMCA takedown notices regarding content posted by the user</li>
                <li>The user has been previously warned about copyright infringement</li>
                <li>The user continues to post infringing content after receiving warnings</li>
                <li>Other circumstances indicate a pattern of infringement</li>
              </ul>
              <p className="mt-4">
                We reserve the right to terminate accounts of repeat infringers without prior notice. We also reserve the right to take other appropriate action, including but not limited to temporary suspension, content removal, or permanent ban.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Special Considerations for Audio Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Clips and Audio Recordings</h3>
                <p>
                  When reporting copyright infringement of audio content, please provide:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Timestamps indicating where the infringing material appears in the clip</li>
                  <li>If possible, a comparison between the original work and the allegedly infringing clip</li>
                  <li>Information about the original recording (artist, title, release date, etc.)</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Remixes and Derivative Works</h3>
                <p>
                  Remixes and derivative works may be protected under fair use or may require permission from the original copyright holder. When reporting infringement in remixes:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Clearly identify which portion of the remix infringes your copyright</li>
                  <li>Explain why the use does not qualify as fair use</li>
                  <li>Provide evidence that you own the copyright to the original work</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Cloning</h3>
                <p>
                  If you believe your voice has been cloned without permission, please include:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Evidence that the voice in question is your voice</li>
                  <li>Proof that you did not consent to voice cloning</li>
                  <li>Information about where and when the cloned voice content appears</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Transcriptions</h3>
                <p>
                  Transcriptions of copyrighted audio may also be subject to copyright protection. If you believe a transcription infringes your copyright, please provide the same information as for audio content.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                False or Fraudulent Notices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                The DMCA provides penalties for submitting false or fraudulent takedown notices. If you knowingly misrepresent that material is infringing, you may be liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Damages, including costs and attorneys' fees, incurred by the alleged infringer</li>
                <li>Damages, including costs and attorneys' fees, incurred by Vocalix</li>
                <li>Any other damages that may be awarded by a court</li>
              </ul>
              <p className="mt-4">
                We take false notices seriously and may pursue legal action against individuals who submit fraudulent DMCA notices.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                Other Intellectual Property Claims
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                This policy specifically addresses copyright infringement under the DMCA. For other intellectual property claims (such as trademark infringement, patent infringement, or trade secret misappropriation), please contact us at <strong>legal@vocalix.com</strong> with the subject line "Intellectual Property Claim."
              </p>
              <p>
                For general content policy violations (harassment, hate speech, etc.), please use our in-app reporting features or contact us at <strong>support@vocalix.com</strong>.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Changes to This Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We may update this DMCA Copyright Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last Updated" date. Your continued use of Vocalix after such changes constitutes your acceptance of the new policy.
              </p>
            </CardContent>
          </Card>

          <Card style={{ willChange: 'auto', contain: 'layout style paint' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you have questions about this DMCA Copyright Policy, please contact us:
              </p>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
                <p><strong>Vocalix Copyright Agent</strong></p>
                <p className="mt-2">Email: copyright@vocalix.com</p>
                <p className="mt-2">For DMCA-related inquiries, please include "DMCA" in the subject line.</p>
              </div>
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  For general legal inquiries, please see our <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> or contact us at <strong>legal@vocalix.com</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            This DMCA Copyright Policy is effective as of the date listed above. By using Vocalix, you acknowledge that you have read, understood, and agree to be bound by this policy and our Terms of Service.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DMCAPolicy;

