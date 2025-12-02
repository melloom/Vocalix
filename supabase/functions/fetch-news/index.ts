import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
  urlToImage?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get API key from environment or use a free alternative
    const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY");
    
    // Try multiple news sources
    let newsArticles: NewsArticle[] = [];

    // Option 1: NewsAPI.org (requires free API key)
    if (NEWS_API_KEY) {
      try {
        const response = await fetch(
          `https://newsapi.org/v2/top-headlines?country=us&category=general&pageSize=10&apiKey=${NEWS_API_KEY}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.articles) {
            newsArticles = data.articles.filter((article: NewsArticle) => 
              article.title && article.description
            );
          }
        }
      } catch (error) {
        console.error("NewsAPI error:", error);
      }
    }

    // Option 2: Fallback to RSS feeds (no API key needed)
    if (newsArticles.length === 0) {
      try {
        // Use RSS2JSON or similar service (free tier available)
        const rssResponse = await fetch(
          "https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml&api_key=public"
        );
        
        if (rssResponse.ok) {
          const rssData = await rssResponse.json();
          if (rssData.items) {
            newsArticles = rssData.items.slice(0, 10).map((item: any) => ({
              title: item.title,
              description: item.description || item.content || "",
              url: item.link,
              publishedAt: item.pubDate,
              source: { name: "BBC News" },
              urlToImage: item.enclosure?.link,
            }));
          }
        }
      } catch (error) {
        console.error("RSS feed error:", error);
      }
    }

    // Option 3: Alternative RSS source if first fails
    if (newsArticles.length === 0) {
      try {
        const altRssResponse = await fetch(
          "https://api.rss2json.com/v1/api.json?rss_url=https://rss.cnn.com/rss/edition.rss&api_key=public"
        );
        
        if (altRssResponse.ok) {
          const altRssData = await altRssResponse.json();
          if (altRssData.items) {
            newsArticles = altRssData.items.slice(0, 10).map((item: any) => ({
              title: item.title,
              description: item.description || item.content || "",
              url: item.link,
              publishedAt: item.pubDate,
              source: { name: "CNN" },
              urlToImage: item.enclosure?.link,
            }));
          }
        }
      } catch (error) {
        console.error("Alternative RSS error:", error);
      }
    }

    // Format response
    const formattedNews = newsArticles.slice(0, 5).map((article) => ({
      id: article.url,
      title: article.title,
      content: article.description?.substring(0, 200) || "",
      url: article.url,
      source: article.source.name,
      publishedAt: article.publishedAt,
      image: article.urlToImage,
    }));

    return new Response(
      JSON.stringify({ news: formattedNews }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error fetching news:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch news", news: [] }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

