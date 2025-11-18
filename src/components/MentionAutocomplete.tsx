import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { User, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FollowedUser {
  id: string;
  handle: string;
  emoji_avatar: string;
}

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (handle: string) => void;
  cursorPosition: number;
  profileId: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export const MentionAutocomplete = ({
  value,
  onChange,
  onSelect,
  cursorPosition,
  profileId,
  textareaRef,
}: MentionAutocompleteProps) => {
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Extract mention query from text at cursor position
  useEffect(() => {
    if (!value || cursorPosition === 0) {
      setShowSuggestions(false);
      return;
    }

    // Find the @ symbol before cursor
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) {
      setShowSuggestions(false);
      return;
    }

    // Check if there's a space after @ (means mention is complete)
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
    if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
      setShowSuggestions(false);
      return;
    }

    // Extract the query (handle being typed)
    const query = textAfterAt.trim();
    setMentionQuery(query);
    setShowSuggestions(true);
    setSelectedIndex(0);
  }, [value, cursorPosition]);

  // Fetch followed users
  useEffect(() => {
    if (!profileId || !showSuggestions) {
      setFollowedUsers([]);
      return;
    }

    const fetchFollowedUsers = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("follows")
          .select(
            `
            following:following_id (
              id,
              handle,
              emoji_avatar
            )
          `
          )
          .eq("follower_id", profileId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const users: FollowedUser[] =
          data
            ?.map((item: any) => {
              const following = Array.isArray(item.following)
                ? item.following[0]
                : item.following;
              return following
                ? {
                    id: following.id,
                    handle: following.handle,
                    emoji_avatar: following.emoji_avatar || "👤",
                  }
                : null;
            })
            .filter((user: FollowedUser | null): user is FollowedUser => user !== null) || [];

        // Filter by query if provided
        const filtered = mentionQuery
          ? users.filter((user) =>
              user.handle.toLowerCase().includes(mentionQuery.toLowerCase())
            )
          : users;

        setFollowedUsers(filtered);
      } catch (error) {
        console.error("Error fetching followed users:", error);
        setFollowedUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFollowedUsers();
  }, [profileId, showSuggestions, mentionQuery]);

  const handleSelectUser = useCallback((handle: string) => {
    if (!textareaRef.current) return;

    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex === -1) return;

    // Replace @query with @handle
    const beforeAt = value.substring(0, lastAtIndex);
    const afterCursor = value.substring(cursorPosition);
    const newValue = `${beforeAt}@${handle} ${afterCursor}`;

    onChange(newValue);
    onSelect(handle);

    // Move cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = lastAtIndex + handle.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);

    setShowSuggestions(false);
  }, [value, cursorPosition, onChange, onSelect, textareaRef]);

  // Handle keyboard navigation from textarea
  useEffect(() => {
    if (!showSuggestions || followedUsers.length === 0 || !textareaRef.current) return;

    const textarea = textareaRef.current;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < followedUsers.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : followedUsers.length - 1
        );
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (followedUsers[selectedIndex]) {
          handleSelectUser(followedUsers[selectedIndex].handle);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowSuggestions(false);
        textarea.focus();
      }
    };

    textarea.addEventListener("keydown", handleKeyDown);
    return () => {
      textarea.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSuggestions, followedUsers, selectedIndex, handleSelectUser, textareaRef]);

  if (!showSuggestions) {
    return null;
  }

  return (
    <div
      ref={suggestionsRef}
      className="absolute z-50 w-full max-w-md mb-1"
      style={{ bottom: "100%" }}
    >
      <Card className="p-2 max-h-64 overflow-y-auto shadow-lg border-2">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : followedUsers.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No users found
          </div>
        ) : (
          <div className="space-y-1">
            {followedUsers.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelectUser(user.handle)}
                className={cn(
                  "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                  "hover:bg-accent",
                  index === selectedIndex && "bg-accent"
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-lg">
                    {user.emoji_avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    @{user.handle}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

