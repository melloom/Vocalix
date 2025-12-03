import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Shield, Users, AlertTriangle, Music, MessageCircle, Heart, Ban, Eye, FileText, Mail, Radio, Volume2 } from "lucide-react";

export const ContentPolicy = () => {
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold">Content Policy & Community Guidelines</h1>
          </div>
          <p className="text-muted-foreground text-sm md:text-base">
            Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Introduction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Welcome to Vocalix, an audio-first social platform where voice is the primary medium of expression. Our Content Policy and Community Guidelines are designed to create a safe, respectful, and authentic environment for all users to share their voice and connect through audio.
              </p>
              <p>
                These guidelines apply to all content on Vocalix, including voice clips, podcast segments, comments, messages, profile information, and any other user-generated content. By using Vocalix, you agree to follow these guidelines. Violations may result in content removal, account warnings, temporary suspensions, or permanent bans.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Our Core Values
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>At Vocalix, we believe in:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Authentic Expression:</strong> Voice creates genuine connections. Be yourself and share your real thoughts and experiences.</li>
                <li><strong>Respectful Dialogue:</strong> Disagreement is welcome, but always maintain respect for others' perspectives and experiences.</li>
                <li><strong>Safe Spaces:</strong> Everyone deserves to feel safe expressing themselves without fear of harassment or abuse.</li>
                <li><strong>Creative Freedom:</strong> Express your creativity through voice while respecting the rights and boundaries of others.</li>
                <li><strong>Community Building:</strong> Build positive connections and contribute to meaningful conversations.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Prohibited Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Illegal Content</h3>
                <p>Do not post content that:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Violates any applicable local, state, national, or international law</li>
                  <li>Promotes illegal activities, including but not limited to drug dealing, human trafficking, or violence</li>
                  <li>Contains threats of violence or harm to individuals or groups</li>
                  <li>Facilitates or coordinates illegal activities</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Harassment and Bullying</h3>
                <p>We have zero tolerance for harassment. Do not:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Target individuals or groups with abusive, threatening, or demeaning content</li>
                  <li>Engage in coordinated harassment or brigading</li>
                  <li>Share private information about others without consent (doxxing)</li>
                  <li>Create content intended to shame, humiliate, or intimidate others</li>
                  <li>Use slurs, hate speech, or discriminatory language targeting protected characteristics</li>
                  <li>Stalk, threaten, or repeatedly contact someone who has asked you to stop</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Hate Speech and Discrimination</h3>
                <p>Content that attacks, incites violence against, or dehumanizes individuals or groups based on:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Race, ethnicity, or national origin</li>
                  <li>Religion or religious beliefs</li>
                  <li>Gender, gender identity, or sexual orientation</li>
                  <li>Disability or medical condition</li>
                  <li>Age or veteran status</li>
                </ul>
                <p className="mt-2">This includes content that promotes hate groups, conspiracy theories targeting protected groups, or content designed to incite violence.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Violence and Graphic Content</h3>
                <p>Do not post content that:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Depicts, glorifies, or encourages violence, gore, or harm to humans or animals</li>
                  <li>Contains graphic descriptions or audio of violence, torture, or death</li>
                  <li>Shows or describes self-harm or suicide in a way that could encourage others</li>
                  <li>Contains disturbing or graphic audio that could traumatize listeners</li>
                </ul>
                <p className="mt-2">We may allow educational or news content about violence if presented responsibly, but it must be clearly marked and contextualized.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Sexual Content</h3>
                <p>Vocalix allows adult content, but with strict guidelines:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Sexual content must be clearly marked as 18+ and properly categorized</li>
                  <li>Do not post content involving minors or that appears to sexualize minors</li>
                  <li>Non-consensual sexual content, revenge porn, or content shared without consent is strictly prohibited</li>
                  <li>Sexual content involving violence, coercion, or non-consent is not allowed</li>
                  <li>Do not use sexual content to harass, shame, or target individuals</li>
                </ul>
                <p className="mt-2">All sexual content must comply with applicable laws and be clearly marked for adult audiences only.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Spam and Manipulation</h3>
                <p>Do not:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Post repetitive, low-quality, or automated content</li>
                  <li>Engage in vote manipulation, fake engagement, or artificial boosting</li>
                  <li>Create multiple accounts to evade bans or restrictions</li>
                  <li>Post misleading or deceptive content to gain followers or engagement</li>
                  <li>Use Vocalix primarily for advertising, promotion, or commercial purposes without disclosure</li>
                  <li>Post content that impersonates others, including public figures, brands, or other users</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Intellectual Property</h3>
                <p>Respect copyright and intellectual property rights:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Do not post copyrighted music, audio, or content without proper authorization</li>
                  <li>Only use original content or content you have rights to use</li>
                  <li>Respect trademark rights and do not use protected brand names or logos without permission</li>
                  <li>If you use someone else's content, provide proper attribution and ensure you have permission</li>
                </ul>
                <p className="mt-2">We respond to valid DMCA takedown requests and may remove content that infringes on intellectual property rights.</p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Misinformation and Deceptive Content</h3>
                <p>Do not post:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>False or misleading information that could cause harm</li>
                  <li>Medical misinformation that contradicts established medical consensus</li>
                  <li>Election misinformation or content designed to suppress voting</li>
                  <li>Content that misrepresents your identity, credentials, or affiliations</li>
                  <li>Deepfakes or manipulated audio designed to deceive</li>
                </ul>
                <p className="mt-2">We distinguish between misinformation and legitimate debate or opinion. Content that could cause real-world harm is prioritized for removal.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Audio-Specific Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Audio Quality and Authenticity</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Record your own voice content. Pre-recorded audio from other sources should be clearly attributed</li>
                  <li>Do not use AI-generated voices to impersonate real people without clear disclosure</li>
                  <li>Ensure your audio is clear enough to be understood (excessive background noise or distortion may be removed)</li>
                  <li>Respect audio length limits (30 seconds for clips, 10 minutes for podcast segments)</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Background Audio and Music</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Use only music and audio you have rights to use</li>
                  <li>Background music should not overpower your voice content</li>
                  <li>Copyrighted music without permission will be removed</li>
                  <li>Consider using royalty-free music or original compositions</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Voice Privacy and Consent</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Do not record or share audio of others without their explicit consent</li>
                  <li>Do not share private conversations or phone calls without permission</li>
                  <li>Respect others' privacy when recording in public spaces</li>
                  <li>Do not use voice cloning technology to create content without disclosure</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Community Interaction Guidelines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Respectful Engagement</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Engage in good faith discussions and debates</li>
                  <li>Listen to others' perspectives, even when you disagree</li>
                  <li>Use constructive criticism rather than personal attacks</li>
                  <li>Respect community-specific rules and moderators</li>
                  <li>Do not derail conversations or spam comments</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Live Rooms and Voice AMAs</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Follow the host's rules and guidelines for each session</li>
                  <li>Respect speaking time and avoid interrupting others</li>
                  <li>Do not use live rooms to harass, spam, or disrupt conversations</li>
                  <li>Report inappropriate behavior in live sessions</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-2">Communities</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Each community may have additional rules - read and follow them</li>
                  <li>Respect community moderators and their decisions</li>
                  <li>Do not post off-topic content in communities</li>
                  <li>Contribute meaningfully to community discussions</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Content Moderation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                Vocalix uses a combination of automated systems and human moderators to enforce these guidelines:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>AI Moderation:</strong> Our systems automatically scan content for policy violations, spam, and harmful content</li>
                <li><strong>Human Review:</strong> Flagged content is reviewed by our moderation team</li>
                <li><strong>Community Moderation:</strong> Community moderators can enforce additional rules within their communities</li>
                <li><strong>User Reports:</strong> Users can report content that violates these guidelines</li>
              </ul>
              <div className="mt-4">
                <h3 className="font-semibold text-foreground mb-2">Enforcement Actions</h3>
                <p>Violations may result in:</p>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>Content removal or hiding</li>
                  <li>Account warnings</li>
                  <li>Temporary account suspension</li>
                  <li>Permanent account ban</li>
                  <li>Legal action in severe cases</li>
                </ul>
                <p className="mt-2">
                  The severity of the action depends on the nature and severity of the violation, your history of violations, and the potential harm caused.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Reporting Violations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you encounter content that violates these guidelines, please report it:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Use the report button on any clip, comment, or profile</li>
                <li>Select the most appropriate category for the violation</li>
                <li>Provide additional context if helpful</li>
                <li>For urgent safety concerns, contact us directly at safety@vocalix.com</li>
              </ul>
              <p className="mt-4">
                We review all reports and take appropriate action. False or malicious reports may result in action against the reporting account.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Appeals Process
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you believe your content was removed or your account was actioned in error, you can appeal:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Review the reason provided for the action</li>
                <li>If you believe it was a mistake, submit an appeal through the platform or contact support</li>
                <li>Provide context and explanation for why you believe the action was incorrect</li>
                <li>We will review appeals and respond within a reasonable timeframe</li>
              </ul>
              <p className="mt-4">
                Note: Repeated violations or appeals without merit may result in longer suspensions or permanent bans.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Policy Updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                We may update this Content Policy from time to time to reflect changes in our platform, legal requirements, or community needs. We will notify users of significant changes by:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Posting the updated policy on this page</li>
                <li>Updating the "Last Updated" date</li>
                <li>Notifying users through in-app notifications for major changes</li>
              </ul>
              <p className="mt-4">
                Continued use of Vocalix after policy updates constitutes acceptance of the updated terms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                If you have questions about this Content Policy or need to report a serious violation, please contact us:
              </p>
              <div className="space-y-2">
                <p><strong>Vocalix</strong></p>
                <p>Email: content-policy@vocalix.com</p>
                <p>For safety emergencies: safety@vocalix.com</p>
                <p>For copyright concerns: copyright@vocalix.com</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            This Content Policy is effective as of the date listed above and applies to all users of Vocalix. By using our platform, you agree to follow these guidelines and help create a positive community for everyone.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContentPolicy;

