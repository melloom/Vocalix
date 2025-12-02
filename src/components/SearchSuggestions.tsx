import { useEffect, useState } from "react";
import { Search, TrendingUp, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearch, type SearchSuggestion } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";

interface SearchSuggestionsProps {
  query: string;
  profileId: string | null | undefined;
  onSelectSuggestion: (suggestion: string) => void;
  onClearHistory?: () => void;
  className?: string;
}

export const SearchSuggestions = ({
  query,
  profileId,
  onSelectSuggestion,
  onClearHistory,
  className,
}: SearchSuggestionsProps) => {
  const { getSearchSuggestions, trendingSearches, searchHistory, getRelatedSearches } = useSearch(profileId);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [relatedSearches, setRelatedSearches] = useState<Array<{ query: string; search_count: number }>>([]);

  useEffect(() => {
    const loadSuggestions = async () => {
      if (query.trim().length > 0) {
        setShowSuggestions(true);
        setIsLoadingSuggestions(true);
        try {
          const [suggestionsData, relatedData] = await Promise.all([
            getSearchSuggestions(query),
            getRelatedSearches(query, 5),
          ]);
          setSuggestions(suggestionsData);
          setRelatedSearches(relatedData);
        } catch (error) {
          console.error("Error loading suggestions:", error);
          setSuggestions([]);
          setRelatedSearches([]);
        } finally {
          setIsLoadingSuggestions(false);
        }
      } else {
        setShowSuggestions(true);
        setSuggestions([]);
        setRelatedSearches([]);
      }
    };

    loadSuggestions();
  }, [query, profileId, getSearchSuggestions, getRelatedSearches]);

  if (!showSuggestions) return null;

  const trending = trendingSearches.data || [];
  const history = searchHistory.data || [];

  const hasContent = suggestions.length > 0 || trending.length > 0 || history.length > 0;

  if (!hasContent && !query) return null;

  return (
    <div
      className={cn(
        "absolute top-full left-0 right-0 z-50 mt-2 rounded-lg border border-border bg-card shadow-lg",
        className
      )}
    >
      <div className="max-h-96 overflow-y-auto p-2">
        {/* Recent Searches */}
        {history.length > 0 && !query && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Recent Searches</span>
              </div>
              {onClearHistory && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={onClearHistory}
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectSuggestion(item.query);
                    setShowSuggestions(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{item.query}</span>
                  <Clock className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {query ? "Suggestions" : "Popular Searches"}
              </span>
            </div>
            <div className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.suggestion}-${index}`}
                  onClick={() => {
                    onSelectSuggestion(suggestion.suggestion);
                    setShowSuggestions(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{suggestion.suggestion}</span>
                  {suggestion.source === "popular" && (
                    <TrendingUp className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* People Also Searched For */}
        {relatedSearches.length > 0 && query && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">People also searched for</span>
            </div>
            <div className="space-y-1">
              {relatedSearches.map((item) => (
                <button
                  key={item.query}
                  onClick={() => {
                    onSelectSuggestion(item.query);
                    setShowSuggestions(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{item.query}</span>
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.search_count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trending Searches */}
        {trending.length > 0 && !query && (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Trending Now</span>
            </div>
            <div className="space-y-1">
              {trending.slice(0, 5).map((item) => (
                <button
                  key={item.query}
                  onClick={() => {
                    onSelectSuggestion(item.query);
                    setShowSuggestions(false);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{item.query}</span>
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.search_count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No Results */}
        {query && suggestions.length === 0 && history.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No suggestions found for "{query}"
          </div>
        )}
      </div>
    </div>
  );
};

