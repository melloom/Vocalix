import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';

interface Topic {
  id: string;
  title: string;
  date: string;
  description: string;
}

interface TopicCardProps {
  topic: Topic;
  clipCount?: number;
  isToday?: boolean;
}

export const TopicCard = ({ topic, clipCount = 0, isToday }: TopicCardProps) => {
  return (
    <Link to={`/topic/${topic.id}`}>
      <Card className={`p-6 space-y-3 cursor-pointer transition-all hover:shadow-lg border border-black/20 dark:border-border/20 hover:border-primary/50 dark:hover:border-primary/30 ${
        isToday ? 'border-2 border-primary bg-primary/5' : ''
      }`}>
        {isToday && (
          <span className="inline-block px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
            Today's Topic
          </span>
        )}
        
        <h3 className="text-xl font-bold text-foreground">{topic.title}</h3>
        <p className="text-sm text-muted-foreground">{topic.description}</p>
        
        <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span>{format(new Date(topic.date), 'MMM d')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span>{clipCount} voices</span>
          </div>
        </div>
      </Card>
    </Link>
  );
};
