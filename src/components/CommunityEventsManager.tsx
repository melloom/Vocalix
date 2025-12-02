import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_end_date: string | null;
  location: string | null;
  is_recurring: boolean;
  recurrence_pattern: string | null;
}

interface CommunityEventsManagerProps {
  communityId: string;
  isHost: boolean;
}

export const CommunityEventsManager = ({
  communityId,
  isHost,
}: CommunityEventsManagerProps) => {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    event_end_date: "",
    location: "",
    is_recurring: false,
    recurrence_pattern: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
  }, [communityId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("community_events")
        .select("*")
        .eq("community_id", communityId)
        .order("event_date", { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Error loading events:", error);
      toast({
        title: "Error loading events",
        description: "Could not load community events.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) {
        toast({
          title: "Error",
          description: "Please log in to create events.",
          variant: "destructive",
        });
        return;
      }

      if (!formData.event_date) {
        toast({
          title: "Error",
          description: "Please select an event date.",
          variant: "destructive",
        });
        return;
      }

      const eventData = {
        community_id: communityId,
        title: formData.title,
        description: formData.description || null,
        event_date: new Date(formData.event_date).toISOString(),
        event_end_date: formData.event_end_date
          ? new Date(formData.event_end_date).toISOString()
          : null,
        location: formData.location || null,
        is_recurring: formData.is_recurring,
        recurrence_pattern: formData.is_recurring
          ? formData.recurrence_pattern || null
          : null,
        created_by_profile_id: profileId,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from("community_events")
          .update(eventData)
          .eq("id", editingEvent.id);

        if (error) throw error;
        toast({
          title: "Event updated",
          description: "Community event has been updated.",
        });
      } else {
        const { error } = await supabase.from("community_events").insert(eventData);

        if (error) throw error;
        toast({
          title: "Event created",
          description: "New community event has been created.",
        });
      }

      setIsDialogOpen(false);
      setEditingEvent(null);
      setFormData({
        title: "",
        description: "",
        event_date: "",
        event_end_date: "",
        location: "",
        is_recurring: false,
        recurrence_pattern: "",
      });
      loadEvents();
    } catch (error) {
      console.error("Error saving event:", error);
      toast({
        title: "Error",
        description: "Could not save event. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      const { error } = await supabase
        .from("community_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
      toast({
        title: "Event deleted",
        description: "Community event has been deleted.",
      });
      loadEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
      toast({
        title: "Error",
        description: "Could not delete event. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (event: CommunityEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || "",
      event_date: format(new Date(event.event_date), "yyyy-MM-dd'T'HH:mm"),
      event_end_date: event.event_end_date
        ? format(new Date(event.event_end_date), "yyyy-MM-dd'T'HH:mm")
        : "",
      location: event.location || "",
      is_recurring: event.is_recurring,
      recurrence_pattern: event.recurrence_pattern || "",
    });
    setIsDialogOpen(true);
  };

  if (!isHost) {
    return (
      <Card className="p-6 rounded-2xl">
        <p className="text-muted-foreground">Only community hosts can manage events.</p>
      </Card>
    );
  }

  const upcomingEvents = events.filter(
    (e) => new Date(e.event_date) >= new Date()
  );
  const pastEvents = events.filter((e) => new Date(e.event_date) < new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Community Events</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage events for your community.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingEvent(null);
            setFormData({
              title: "",
              description: "",
              event_date: "",
              event_end_date: "",
              location: "",
              is_recurring: false,
              recurrence_pattern: "",
            });
            setIsDialogOpen(true);
          }}
          className="rounded-2xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      {events.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <p className="text-muted-foreground">No events scheduled yet.</p>
          <Button
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            className="mt-4 rounded-2xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create First Event
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {upcomingEvents.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Upcoming Events</h4>
              <div className="space-y-2">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={() => openEditDialog(event)}
                    onDelete={() => handleDelete(event.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {pastEvents.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Past Events</h4>
              <div className="space-y-2">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={() => openEditDialog(event)}
                    onDelete={() => handleDelete(event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create Event"}</DialogTitle>
            <DialogDescription>
              Create an event for your community members.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Event Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Weekly Community Meeting"
                className="rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe the event..."
                className="rounded-2xl min-h-[100px]"
                maxLength={500}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event_date">Start Date & Time</Label>
                <Input
                  id="event_date"
                  type="datetime-local"
                  value={formData.event_date}
                  onChange={(e) =>
                    setFormData({ ...formData, event_date: e.target.value })
                  }
                  className="rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event_end_date">End Date & Time (Optional)</Label>
                <Input
                  id="event_end_date"
                  type="datetime-local"
                  value={formData.event_end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, event_end_date: e.target.value })
                  }
                  className="rounded-2xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location (Optional)</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                placeholder="e.g., Virtual, Zoom Room 123, or Physical Address"
                className="rounded-2xl"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_recurring">Recurring Event</Label>
              <Switch
                id="is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_recurring: checked })
                }
              />
            </div>

            {formData.is_recurring && (
              <div className="space-y-2">
                <Label htmlFor="recurrence_pattern">Recurrence Pattern</Label>
                <Input
                  id="recurrence_pattern"
                  value={formData.recurrence_pattern}
                  onChange={(e) =>
                    setFormData({ ...formData, recurrence_pattern: e.target.value })
                  }
                  placeholder="e.g., weekly, monthly, daily"
                  className="rounded-2xl"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} className="rounded-2xl">
              {editingEvent ? "Update" : "Create"} Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EventCard = ({
  event,
  onEdit,
  onDelete,
}: {
  event: CommunityEvent;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold">{event.title}</h4>
            {event.is_recurring && (
              <Badge variant="outline">Recurring</Badge>
            )}
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
          )}
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <strong>Date:</strong> {format(new Date(event.event_date), "PPP p")}
            </p>
            {event.event_end_date && (
              <p>
                <strong>Ends:</strong> {format(new Date(event.event_end_date), "PPP p")}
              </p>
            )}
            {event.location && (
              <p className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit} className="rounded-xl">
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="rounded-xl text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

