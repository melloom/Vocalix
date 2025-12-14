import { useState } from "react";
import { Filter, X, Calendar as CalendarIcon, Clock, MapPin, Tag, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "@/components/EmojiPicker";

export interface SearchFilters {
  moodEmoji: string | null;
  durationMin: number | null;
  durationMax: number | null;
  durationPreset: "short" | "medium" | "long" | null; // New: duration presets
  dateFrom: Date | null;
  dateTo: Date | null;
  city: string | null;
  topicId: string | null;
  qualityBadge: "excellent" | "good" | "fair" | null;
  emotion: "joy" | "sadness" | "anger" | "fear" | "surprise" | "disgust" | "neutral" | "excited" | "calm" | "frustrated" | "happy" | "melancholic" | null;
  searchQuery: string;
  minReactions: number | null; // New: minimum reactions filter
  minListens: number | null; // New: minimum listens filter
  minCompletionRate: number | null; // New: minimum completion rate (0-100)
  creatorReputation: "high" | "medium" | "low" | null; // New: creator reputation filter
  language: string | null; // New: language filter (if available)
}

interface AdvancedSearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTopics: Array<{ id: string; title: string }>;
  availableCities: string[];
  onSaveSearch?: (name: string) => void;
  savedSearches?: Array<{ id: string; name: string; filters: SearchFilters }>;
  onLoadSearch?: (filters: SearchFilters) => void;
  onDeleteSearch?: (id: string) => void;
}

export const AdvancedSearchFilters = ({
  filters,
  onFiltersChange,
  availableTopics,
  availableCities,
  onSaveSearch,
  savedSearches = [],
  onLoadSearch,
  onDeleteSearch,
}: AdvancedSearchFiltersProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilter = (key: keyof SearchFilters) => {
    if (key === "searchQuery") {
      updateFilter("searchQuery", "");
    } else {
      updateFilter(key, null);
    }
  };

  const clearAllFilters = () => {
    onFiltersChange({
      moodEmoji: null,
      durationMin: null,
      durationMax: null,
      durationPreset: null,
      dateFrom: null,
      dateTo: null,
      city: null,
      topicId: null,
      qualityBadge: null,
      emotion: null,
      searchQuery: filters.searchQuery, // Keep search query
      minReactions: null,
      minListens: null,
      minCompletionRate: null,
      creatorReputation: null,
      language: null,
    });
  };

  const hasActiveFilters = 
    filters.moodEmoji !== null ||
    filters.durationMin !== null ||
    filters.durationMax !== null ||
    filters.durationPreset !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.city !== null ||
    filters.topicId !== null ||
    filters.qualityBadge !== null ||
    filters.emotion !== null ||
    filters.minReactions !== null ||
    filters.minListens !== null ||
    filters.minCompletionRate !== null ||
    filters.creatorReputation !== null ||
    filters.language !== null;

  const handleSaveSearch = () => {
    if (saveSearchName.trim() && onSaveSearch) {
      onSaveSearch(saveSearchName.trim());
      setSaveSearchName("");
      setShowSaveDialog(false);
    }
  };

  const handleLoadSearch = (savedFilters: SearchFilters) => {
    if (onLoadSearch) {
      onLoadSearch(savedFilters);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? "default" : "outline"}
            size="sm"
            className="rounded-full"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                {[
                  filters.moodEmoji,
                  filters.durationMin !== null || filters.durationMax !== null,
                  filters.dateFrom || filters.dateTo,
                  filters.city,
                  filters.topicId,
                ].filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Advanced Filters</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-7 text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Saved Searches */}
            {savedSearches.length > 0 && (
              <div className="space-y-2 border-b pb-4">
                <Label className="text-xs font-medium text-muted-foreground">Saved Searches</Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {savedSearches.map((saved) => (
                    <div key={saved.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <button
                        onClick={() => handleLoadSearch(saved.filters)}
                        className="flex-1 text-left text-xs font-medium hover:underline"
                      >
                        {saved.name}
                      </button>
                      {onDeleteSearch && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => onDeleteSearch(saved.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mood Emoji Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Mood Emoji</Label>
                {filters.moodEmoji && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => clearFilter("moodEmoji")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <EmojiPicker
                value={filters.moodEmoji}
                onChange={(emoji) => updateFilter("moodEmoji", emoji)}
                placeholder="😊"
                className="w-full"
              />
            </div>

            {/* Duration Range */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Duration</Label>
                {(filters.durationMin !== null || filters.durationMax !== null || filters.durationPreset !== null) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      updateFilter("durationMin", null);
                      updateFilter("durationMax", null);
                      updateFilter("durationPreset", null);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {/* Duration Presets */}
              <div className="flex gap-2">
                <Button
                  variant={filters.durationPreset === "short" ? "default" : "outline"}
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    if (filters.durationPreset === "short") {
                      updateFilter("durationPreset", null);
                      updateFilter("durationMin", null);
                      updateFilter("durationMax", null);
                    } else {
                      updateFilter("durationPreset", "short");
                      updateFilter("durationMin", 0);
                      updateFilter("durationMax", 10);
                    }
                  }}
                >
                  Short (&lt;10s)
                </Button>
                <Button
                  variant={filters.durationPreset === "medium" ? "default" : "outline"}
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    if (filters.durationPreset === "medium") {
                      updateFilter("durationPreset", null);
                      updateFilter("durationMin", null);
                      updateFilter("durationMax", null);
                    } else {
                      updateFilter("durationPreset", "medium");
                      updateFilter("durationMin", 10);
                      updateFilter("durationMax", 20);
                    }
                  }}
                >
                  Medium (10-20s)
                </Button>
                <Button
                  variant={filters.durationPreset === "long" ? "default" : "outline"}
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    if (filters.durationPreset === "long") {
                      updateFilter("durationPreset", null);
                      updateFilter("durationMin", null);
                      updateFilter("durationMax", null);
                    } else {
                      updateFilter("durationPreset", "long");
                      updateFilter("durationMin", 20);
                      updateFilter("durationMax", 30);
                    }
                  }}
                >
                  Long (&gt;20s)
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.durationMin ?? ""}
                    onChange={(e) => {
                      updateFilter("durationMin", e.target.value ? Number(e.target.value) : null);
                      updateFilter("durationPreset", null); // Clear preset when manually setting
                    }}
                    className="h-8 text-sm"
                    min={0}
                    max={30}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.durationMax ?? ""}
                    onChange={(e) => {
                      updateFilter("durationMax", e.target.value ? Number(e.target.value) : null);
                      updateFilter("durationPreset", null); // Clear preset when manually setting
                    }}
                    className="h-8 text-sm"
                    min={0}
                    max={30}
                  />
                </div>
                <Slider
                  value={[
                    filters.durationMin ?? 0,
                    filters.durationMax ?? 30,
                  ]}
                  onValueChange={([min, max]) => {
                    updateFilter("durationMin", min);
                    updateFilter("durationMax", max);
                    updateFilter("durationPreset", null); // Clear preset when manually setting
                  }}
                  min={0}
                  max={30}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0s</span>
                  <span>30s</span>
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Date Range</Label>
                {(filters.dateFrom || filters.dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      updateFilter("dateFrom", null);
                      updateFilter("dateTo", null);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 flex-1 justify-start text-left font-normal",
                        !filters.dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {filters.dateFrom ? format(filters.dateFrom, "MMM d") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom || undefined}
                      onSelect={(date) => updateFilter("dateFrom", date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 flex-1 justify-start text-left font-normal",
                        !filters.dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {filters.dateTo ? format(filters.dateTo, "MMM d") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo || undefined}
                      onSelect={(date) => updateFilter("dateTo", date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* City Filter */}
            {availableCities.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">City</Label>
                  {filters.city && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => clearFilter("city")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Select
                  value={filters.city || ""}
                  onValueChange={(value) => updateFilter("city", value || null)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All cities</SelectItem>
                    {availableCities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Topic Filter */}
            {availableTopics.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Topic</Label>
                  {filters.topicId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => clearFilter("topicId")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Select
                  value={filters.topicId || ""}
                  onValueChange={(value) => updateFilter("topicId", value || null)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select topic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All topics</SelectItem>
                    {availableTopics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quality Badge Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Audio Quality</Label>
                {filters.qualityBadge && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => clearFilter("qualityBadge")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Select
                value={filters.qualityBadge || ""}
                onValueChange={(value) => updateFilter("qualityBadge", (value || null) as "excellent" | "good" | "fair" | null)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Any quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any quality</SelectItem>
                  <SelectItem value="excellent">
                    ⭐ Excellent (8.0+)
                  </SelectItem>
                  <SelectItem value="good">
                    ✨ Good (6.0-7.9)
                  </SelectItem>
                  <SelectItem value="fair">
                    🎤 Fair (4.0-5.9)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Emotion Filter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Emotion</Label>
                {filters.emotion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => clearFilter("emotion")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Select
                value={filters.emotion || ""}
                onValueChange={(value) => updateFilter("emotion", (value || null) as typeof filters.emotion)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Any emotion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any emotion</SelectItem>
                  <SelectItem value="joy">😊 Joy</SelectItem>
                  <SelectItem value="happy">😄 Happy</SelectItem>
                  <SelectItem value="excited">🎉 Excited</SelectItem>
                  <SelectItem value="calm">😌 Calm</SelectItem>
                  <SelectItem value="neutral">😐 Neutral</SelectItem>
                  <SelectItem value="sadness">😢 Sadness</SelectItem>
                  <SelectItem value="melancholic">😔 Melancholic</SelectItem>
                  <SelectItem value="anger">😠 Anger</SelectItem>
                  <SelectItem value="frustrated">😤 Frustrated</SelectItem>
                  <SelectItem value="fear">😨 Fear</SelectItem>
                  <SelectItem value="surprise">😲 Surprise</SelectItem>
                  <SelectItem value="disgust">🤢 Disgust</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Engagement Filters */}
            <div className="space-y-3 border-t pt-3">
              <Label className="text-xs font-medium">Engagement</Label>
              
              {/* Min Reactions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Min Reactions</Label>
                  {filters.minReactions !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => clearFilter("minReactions")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Input
                  type="number"
                  placeholder="Any"
                  value={filters.minReactions ?? ""}
                  onChange={(e) => updateFilter("minReactions", e.target.value ? Number(e.target.value) : null)}
                  className="h-8 text-sm"
                  min={0}
                />
              </div>

              {/* Min Listens */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Min Listens</Label>
                  {filters.minListens !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => clearFilter("minListens")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Input
                  type="number"
                  placeholder="Any"
                  value={filters.minListens ?? ""}
                  onChange={(e) => updateFilter("minListens", e.target.value ? Number(e.target.value) : null)}
                  className="h-8 text-sm"
                  min={0}
                />
              </div>

              {/* Min Completion Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Min Completion Rate (%)</Label>
                  {filters.minCompletionRate !== null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => clearFilter("minCompletionRate")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    type="number"
                    placeholder="Any"
                    value={filters.minCompletionRate ?? ""}
                    onChange={(e) => updateFilter("minCompletionRate", e.target.value ? Number(e.target.value) : null)}
                    className="h-8 text-sm"
                    min={0}
                    max={100}
                  />
                  <Slider
                    value={[filters.minCompletionRate ?? 0]}
                    onValueChange={([value]) => updateFilter("minCompletionRate", value)}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Creator Reputation Filter */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Creator Reputation</Label>
                {filters.creatorReputation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => clearFilter("creatorReputation")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Select
                value={filters.creatorReputation || ""}
                onValueChange={(value) => updateFilter("creatorReputation", (value || null) as typeof filters.creatorReputation)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Any reputation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any reputation</SelectItem>
                  <SelectItem value="high">⭐ High (Top creators)</SelectItem>
                  <SelectItem value="medium">✨ Medium (Established)</SelectItem>
                  <SelectItem value="low">🎤 Low (New creators)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Save Search */}
            {onSaveSearch && hasActiveFilters && (
              <div className="space-y-2 border-t pt-4">
                {!showSaveDialog ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8"
                    onClick={() => setShowSaveDialog(true)}
                  >
                    <Save className="h-3 w-3 mr-2" />
                    Save this search
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Search name"
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveSearch();
                        } else if (e.key === "Escape") {
                          setShowSaveDialog(false);
                          setSaveSearchName("");
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8"
                        onClick={handleSaveSearch}
                        disabled={!saveSearchName.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setShowSaveDialog(false);
                          setSaveSearchName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

