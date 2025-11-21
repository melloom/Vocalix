import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, MessageSquare, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { usePrivateChats } from "@/hooks/usePrivateChats";
import { CreatePrivateChatModal } from "@/components/CreatePrivateChatModal";
import { PrivateChatRoom } from "@/components/PrivateChatRoom";
import { useProfile } from "@/hooks/useProfile";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

const PrivateChats = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { chatId } = useParams<{ chatId?: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const { chats, isLoading, error, refetch } = usePrivateChats();

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (chatId) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/private-chats">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Private Chat</h1>
            <div className="w-10" /> {/* Spacer */}
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6">
          <PrivateChatRoom chatId={chatId} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Private Chats</h1>
          </div>
          {profile && (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="rounded-2xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-2xl"
          />
        </div>

        {/* Chats List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 rounded-2xl">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 rounded-2xl text-center">
            <p className="text-muted-foreground">Failed to load chats. Please try again.</p>
          </Card>
        ) : filteredChats.length === 0 ? (
          <Card className="p-6 rounded-2xl text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-semibold mb-2">No private chats yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery ? "No chats match your search." : "Create a private chat to start a conversation with friends."}
            </p>
            {profile && !searchQuery && (
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Chat
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredChats.map((chat) => (
              <Card
                key={chat.id}
                className="p-4 rounded-2xl cursor-pointer hover:bg-muted/50 transition-colors"
                asChild
              >
                <Link to={`/private-chats/${chat.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{chat.avatar_emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold truncate">{chat.name}</h4>
                        <Badge variant="secondary" className="text-xs">Private</Badge>
                      </div>
                      {chat.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                          {chat.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {chat.message_count} messages
                        </span>
                        {chat.last_message_at && (
                          <span>
                            Last message {formatDistanceToNow(new Date(chat.last_message_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>

      <CreatePrivateChatModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetch();
        }}
      />
    </div>
  );
};

export default PrivateChats;

