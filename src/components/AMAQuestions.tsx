import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Mic, Play, MessageCircle, ThumbsUp } from "lucide-react";
import { RecordModal } from "@/components/RecordModal";
import { logError } from "@/lib/logger";

interface AMAQuestion {
  id: string;
  room_id: string;
  questioner_profile_id: string | null;
  audio_question_path: string | null;
  text_question: string | null;
  status: "pending" | "answered" | "skipped" | "archived";
  answered_at: string | null;
  answer_clip_id: string | null;
  upvotes: number;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface AMAQuestionsProps {
  roomId: string;
  isHost: boolean;
  questionDeadline?: string | null;
  questionSubmissionEnabled?: boolean;
}

export const AMAQuestions = ({
  roomId,
  isHost,
  questionDeadline,
  questionSubmissionEnabled = true,
}: AMAQuestionsProps) => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<AMAQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [textQuestion, setTextQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  useEffect(() => {
    loadQuestions();

    // Subscribe to new questions
    const channel = supabase
      .channel(`ama-questions-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ama_questions",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadQuestions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("ama_questions")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("room_id", roomId)
        .order("upvotes", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedQuestions: AMAQuestion[] = (data || []).map((q: any) => ({
        ...q,
        profiles: Array.isArray(q.profiles) ? q.profiles[0] : q.profiles,
      }));

      setQuestions(formattedQuestions);
    } catch (error) {
      logError("Error loading AMA questions", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitTextQuestion = async () => {
    if (!textQuestion.trim() || !profile?.id) return;

    try {
      setIsSubmitting(true);

      // Check if question deadline has passed
      if (questionDeadline && new Date(questionDeadline) < new Date()) {
        toast({
          title: "Deadline passed",
          description: "Question submission deadline has passed",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("ama_questions").insert({
        room_id: roomId,
        questioner_profile_id: profile.id,
        text_question: textQuestion.trim(),
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Question submitted!",
        description: "Your question has been submitted",
      });

      setTextQuestion("");
    } catch (error: any) {
      logError("Error submitting question", error);
      toast({
        title: "Failed to submit question",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAudioQuestion = async (audioBlob: Blob) => {
    if (!profile?.id) return;

    try {
      setIsSubmitting(true);

      // Check if question deadline has passed
      if (questionDeadline && new Date(questionDeadline) < new Date()) {
        toast({
          title: "Deadline passed",
          description: "Question submission deadline has passed",
          variant: "destructive",
        });
        return;
      }

      // Upload audio file
      const audioFile = new File([audioBlob], `ama-question-${Date.now()}.webm`, {
        type: "audio/webm",
      });
      const audioPath = `ama-questions/${roomId}/${profile.id}/${Date.now()}-${audioFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(audioPath, audioFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("audio")
        .getPublicUrl(audioPath);

      // Create question record
      const { error } = await supabase.from("ama_questions").insert({
        room_id: roomId,
        questioner_profile_id: profile.id,
        audio_question_path: publicUrl,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Audio question submitted!",
        description: "Your question has been submitted",
      });

      setIsRecordModalOpen(false);
    } catch (error: any) {
      logError("Error submitting audio question", error);
      toast({
        title: "Failed to submit question",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpvote = async (questionId: string) => {
    if (!profile?.id) return;

    try {
      const question = questions.find((q) => q.id === questionId);
      if (!question) return;

      const { error } = await supabase
        .from("ama_questions")
        .update({ upvotes: (question.upvotes || 0) + 1 })
        .eq("id", questionId);

      if (error) throw error;

      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId ? { ...q, upvotes: (q.upvotes || 0) + 1 } : q
        )
      );
    } catch (error) {
      logError("Error upvoting question", error);
    }
  };

  const canSubmitQuestions = questionSubmissionEnabled && 
    (!questionDeadline || new Date(questionDeadline) > new Date());

  return (
    <div className="space-y-4">
      {canSubmitQuestions && !isHost && (
        <Card className="p-4 rounded-2xl">
          <Label className="text-sm font-semibold mb-2 block">Submit a Question</Label>
          <div className="space-y-3">
            <Textarea
              value={textQuestion}
              onChange={(e) => setTextQuestion(e.target.value)}
              placeholder="Type your question here..."
              rows={3}
              maxLength={500}
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitTextQuestion}
                disabled={!textQuestion.trim() || isSubmitting}
                className="flex-1"
                size="sm"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Submit Text Question
              </Button>
              <Button
                onClick={() => setIsRecordModalOpen(true)}
                variant="outline"
                disabled={isSubmitting}
                size="sm"
              >
                <Mic className="h-4 w-4 mr-2" />
                Record Audio
              </Button>
            </div>
          </div>
        </Card>
      )}

      {questionDeadline && new Date(questionDeadline) < new Date() && (
        <Badge variant="secondary" className="w-full justify-center">
          Question submission deadline has passed
        </Badge>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold">
          Questions ({questions.filter((q) => q.status === "pending").length} pending)
        </h3>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Loading questions...</div>
        ) : questions.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground rounded-2xl">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No questions yet</p>
            {canSubmitQuestions && !isHost && (
              <p className="text-sm mt-2">Be the first to ask a question!</p>
            )}
          </Card>
        ) : (
          questions.map((question) => (
            <Card key={question.id} className="p-4 rounded-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {question.profiles?.emoji_avatar || "👤"}
                    </span>
                    <span className="font-semibold">
                      @{question.profiles?.handle || "Anonymous"}
                    </span>
                    {question.status === "answered" && (
                      <Badge variant="default" className="text-xs">Answered</Badge>
                    )}
                  </div>
                  {question.text_question && (
                    <p className="text-sm">{question.text_question}</p>
                  )}
                  {question.audio_question_path && (
                    <div className="flex items-center gap-2">
                      <audio
                        src={question.audio_question_path}
                        controls
                        className="flex-1 h-8"
                      />
                    </div>
                  )}
                  {question.answer_clip_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/clip/${question.answer_clip_id}`, "_blank")}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Listen to Answer
                    </Button>
                  )}
                </div>
                {!isHost && question.status === "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUpvote(question.id)}
                    className="flex flex-col items-center gap-1"
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-xs">{question.upvotes || 0}</span>
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onRecordComplete={handleSubmitAudioQuestion}
        maxDuration={60}
        title="Record Your Question"
        description="Record an audio question (max 60 seconds)"
      />
    </div>
  );
};

