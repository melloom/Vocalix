import { Link } from "react-router-dom";
import { useMemo } from "react";

interface MentionTextProps {
  text: string;
  highlightQuery?: string;
  className?: string;
}

/**
 * Component that renders text with clickable @mentions and #hashtags
 * Mentions are parsed from text and converted to profile links
 * Hashtags are parsed and converted to tag page links
 */
export const MentionText = ({ text, highlightQuery = "", className = "" }: MentionTextProps) => {
  const renderedText = useMemo(() => {
    if (!text) return null;

    // Patterns to match @mentions and #hashtags
    const mentionPattern = /@([a-zA-Z0-9_-]+)/g;
    const hashtagPattern = /#([a-zA-Z0-9_]+)/g;
    
    // Find all matches with their positions
    const matches: Array<{
      type: "mention" | "hashtag";
      content: string;
      value: string;
      index: number;
    }> = [];

    let match;
    while ((match = mentionPattern.exec(text)) !== null) {
      matches.push({
        type: "mention",
        content: match[0],
        value: match[1],
        index: match.index,
      });
    }

    while ((match = hashtagPattern.exec(text)) !== null) {
      matches.push({
        type: "hashtag",
        content: match[0],
        value: match[1],
        index: match.index,
      });
    }

    // Sort matches by index
    matches.sort((a, b) => a.index - b.index);

    // If no matches found, return original text
    if (matches.length === 0) {
      return text;
    }

    // Build parts array
    const parts: Array<{
      type: "text" | "mention" | "hashtag";
      content: string;
      value?: string;
    }> = [];

    let lastIndex = 0;

    for (const match of matches) {
      // Add text before match
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        if (beforeText) {
          parts.push({ type: "text", content: beforeText });
        }
      }

      // Add match
      parts.push({
        type: match.type,
        content: match.content,
        value: match.value,
      });

      lastIndex = match.index + match.content.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      if (remainingText) {
        parts.push({ type: "text", content: remainingText });
      }
    }

    // Render parts with mentions and hashtags as links
    return parts.map((part, index) => {
      if (part.type === "mention") {
        return (
          <Link
            key={index}
            to={`/profile/${part.value}`}
            className="text-primary hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {part.content}
          </Link>
        );
      }

      if (part.type === "hashtag") {
        return (
          <Link
            key={index}
            to={`/tag/${encodeURIComponent(part.value || "")}`}
            className="text-primary hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {part.content}
          </Link>
        );
      }

      // Highlight search query in text parts
      if (highlightQuery && part.content.toLowerCase().includes(highlightQuery.toLowerCase())) {
        const escapedQuery = highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escapedQuery})`, "gi");
        const highlightedParts = part.content.split(regex);

        return (
          <span key={index}>
            {highlightedParts.map((highlightPart, highlightIndex) => {
              if (highlightPart.toLowerCase() === highlightQuery.toLowerCase()) {
                return (
                  <mark key={highlightIndex} className="bg-yellow-200 dark:bg-yellow-900">
                    {highlightPart}
                  </mark>
                );
              }
              return <span key={highlightIndex}>{highlightPart}</span>;
            })}
          </span>
        );
      }

      return <span key={index}>{part.content}</span>;
    });
  }, [text, highlightQuery]);

  return <span className={className}>{renderedText || text}</span>;
};

