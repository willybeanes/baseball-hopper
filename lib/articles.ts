export type Article = {
  title: string;
  subtitle: string;
  date: string;
  slug: string;
  img: string;
};

// Used when the Beehiiv API is unconfigured or fails.
export const FALLBACK_ARTICLES: Article[] = [
  {
    title: "Older but not Wiser+",
    subtitle: "Analyzing how Hitting+ components change with age",
    date: "Aug 27, 2026",
    slug: "older-but-not-wiser",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/01a568ee-2d76-408a-8b03-5f549aeae125/gettyimages-2290520599-2048x2048.jpg",
  },
  {
    title: "Hitting Plus Positive",
    subtitle: "I can do bad (hitting model) all by myself",
    date: "Aug 21, 2026",
    slug: "hitting-plus-positive",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/33afb1ce-82f4-439e-aff7-48e7de6deb55/2282744393_large_cropped.png",
  },
  {
    title: "Fast Times At Bat Speed High",
    subtitle: "Learn it. Know it. Live it.",
    date: "Jul 31, 2026",
    slug: "fast-times-at-bat-speed-high",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/26d16d62-d254-4475-8749-cd84222a4d2a/gettyimages-2283677121_copy.png",
  },
  {
    title: "The Perfect (Game) Score 2: The Re-Take",
    subtitle: "Every bit as necessary as a direct-to-video sequel",
    date: "Jul 22, 2026",
    slug: "the-perfect-game-score-2-the-re-take",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/af3dbc0a-cec6-41c0-8e17-5a49ec7ee40e/roberts-dugout_copy.jpg",
  },
  {
    title: "Semi-Charmed Kind of Schedule",
    subtitle: "The cost to making team schedules pretty",
    date: "Jul 21, 2026",
    slug: "semi-charmed-kind-of-schedule",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/af14a92c-5e05-45f3-97d0-ed889741ef2e/wmgzuifp09si7c2fltbi.jpeg",
  },
  {
    title: "Spoiled Milk in Your Fine Wine",
    subtitle: "The poison pill inside a hitter's plate discipline gains",
    date: "Nov 14, 2025",
    slug: "spoiled-milk-in-your-fine-wine",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/2efcba30-2c43-42d2-8551-2776399a9715/13b6e396-6a35-468f-b144-e8dd54237ff5_686x386.jpeg",
  },
  {
    title: "Rise of the Kitchen Sink Starters",
    subtitle: "Let that sink in",
    date: "Jul 15, 2024",
    slug: "rise-of-the-kitchen-sink-starters",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/7b958aa3-1fc6-4d28-96ba-5e30d4dfa7da/1ff737b7-a302-4fb0-828f-691594630b87_2560x1707.jpeg",
  },
  {
    title: "Isaack of Pulled-tatoes",
    subtitle: "Searching for the next Paredes",
    date: "Nov 14, 2023",
    slug: "isaack-of-pulled-tatoes",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/2c60ddbb-17e0-468e-978b-4c9f46e25ca2/04a0f144-335c-4153-8e98-40a1d72c5ffe_900x506.jpg",
  },
  {
    title: "Let's Play Two (hours)!",
    subtitle: "How good could a game be if it's shorter than Howl's Moving Castle?",
    date: "Apr 7, 2023",
    slug: "lets-play-a-nine-inning-game-in-two",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/091dc3d6-aa8d-4542-aab1-d750dea79c5f/e9a993a7-48bf-4328-a028-bf7de9608806_960x495.jpg",
  },
];

type BeehiivPost = {
  title?: string;
  subtitle?: string;
  slug?: string;
  thumbnail_url?: string;
  publish_date?: number;
};

function fmtDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function getArticles(limit = 8): Promise<Article[]> {
  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) return FALLBACK_ARTICLES.slice(0, limit);

  try {
    const url =
      `https://api.beehiiv.com/v2/publications/${pub}/posts` +
      `?status=confirmed&audience=free&order_by=publish_date&direction=desc&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`beehiiv ${res.status}`);
    const json: { data?: BeehiivPost[] } = await res.json();
    const posts = (json.data ?? []).filter((p) => p.slug && p.title);
    if (posts.length === 0) throw new Error("beehiiv returned no posts");
    const live: Article[] = posts.map((p) => ({
      title: p.title!,
      subtitle: p.subtitle ?? "",
      date: p.publish_date ? fmtDate(p.publish_date) : "",
      slug: p.slug!,
      img: p.thumbnail_url ?? "",
    }));
    // The API can return fewer posts than requested; top up from the archive.
    const seen = new Set(live.map((a) => a.slug));
    const extra = FALLBACK_ARTICLES.filter((a) => !seen.has(a.slug));
    return [...live, ...extra].slice(0, limit);
  } catch (err) {
    console.error("getArticles fallback:", err);
    return FALLBACK_ARTICLES.slice(0, limit);
  }
}

export type FullArticle = Article & {
  /** beehiiv's rendered post body (already includes the title/byline header). */
  html: string;
  /** Class-scoped CSS beehiiv ships in the post's <head>. */
  css: string;
  webUrl: string;
};

type BeehiivFullPost = BeehiivPost & {
  web_url?: string;
  content?: { free?: { web?: string } };
};

/** Pull the <body> and head <style> blocks out of beehiiv's full-page web HTML. */
function splitWebHtml(doc: string): { html: string; css: string } {
  const body = doc.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? doc;
  const head = doc.split(/<body/i)[0];
  const css = [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n")
    // :root color/font vars are remapped to site tokens on the wrapper instead.
    .replace(/:root\s*\{[\s\S]*?\}/g, "");
  // beehiiv web content has no scripts today; strip defensively anyway.
  const html = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Links to other Balls & Sticks posts open the in-site version, same tab.
    .replace(/<a\b[^>]*>/gi, (tag) => {
      const m = tag.match(/href=(["'])https?:\/\/ballsandsticks\.beehiiv\.com\/p\/([a-z0-9-]+)[^"']*\1/i);
      if (!m) return tag;
      return tag
        .replace(m[0], `href="/blog/${m[2]}"`)
        .replace(/\s(target|rel)=(["'])[^"']*\2/gi, "");
    });
  return { html, css };
}

export async function getArticle(slug: string): Promise<FullArticle | null> {
  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  if (!key || !pub) return null;

  try {
    const url =
      `https://api.beehiiv.com/v2/publications/${pub}/posts` +
      `?slugs[]=${encodeURIComponent(slug)}&status=confirmed&expand[]=free_web_content`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`beehiiv ${res.status}`);
    const json: { data?: BeehiivFullPost[] } = await res.json();
    const p = json.data?.find((x) => x.slug === slug);
    const web = p?.content?.free?.web;
    if (!p || !web) return null;
    return {
      title: p.title ?? "",
      subtitle: p.subtitle ?? "",
      date: p.publish_date ? fmtDate(p.publish_date) : "",
      slug,
      img: p.thumbnail_url ?? "",
      webUrl: p.web_url ?? `https://ballsandsticks.beehiiv.com/p/${slug}`,
      ...splitWebHtml(web),
    };
  } catch (err) {
    console.error("getArticle failed:", err);
    return null;
  }
}
