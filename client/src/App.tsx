import { useEffect, useRef, useState } from "react";
import { Scrape, Vector } from "@genezio-sdk/opanai-rag";
import "./App.css";
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(-1);
  const [scrapedPages, setScrapedPages] = useState(0);
  const [indexedPages, setIndexedPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchUrl, setSearchUrl] = useState("");
  const loading = useRef(true);
  const scraping = useRef(false);
  const indexing = useRef(false);

  async function search() {
    setSearching(true);
    setResponse("");
    setLinks([]);

    const response = await fetch(import.meta.env.VITE_QUERY_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query})
    });

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let linksReceived = false;
      const lLinks = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break; // Exit loop when the stream is done
        }
        
        // Decode and append the chunk
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;
        if (!linksReceived) {
          while(true) {
            const link = result.match(/^(.+)\n/);
            if (link) {
              // found a link
              lLinks.push(link[1]);
              result = result.replace(/^.+\n/, "");
            } else
              break;
          }
          if (result.match(/^\n/)) {
            // end links
            result = result.replace(/^\n/, "");
            linksReceived = true;
            setLinks(lLinks);
          }
        }
        
        if (linksReceived) {
          setResponse(result);
        }
      }
    }
    setSearching(false);
  }

  async function scrape() {
    await Scrape.scrape();
  }

  async function index() {
    await Vector.saveEmbeddings();
  }

  function refreshStatus() {
    Scrape.status().then((status: any) => {
      if (!status) {
        status = { totalPages: 0, scrapedPages: 0, indexedPages: 0 };
      }
      if (!status.indexedPages) {
        status.indexedPages = 0;
      }
      setTotalPages(status.totalPages);
      setScrapedPages(status.scrapedPages);
      setIndexedPages(status.indexedPages);

      if (status.totalPages == 0 && !scraping.current) {
        scraping.current = true;
        Scrape.scrape();
      }

      if (status.totalPages > 0 && status.scrapedPages == status.totalPages && status.indexedPages == 0 && !indexing.current) {
        indexing.current = true;
        Vector.saveEmbeddings();
      }

      if (status.totalPages == 0 || status.scrapedPages != status.totalPages || status.indexedPages != status.totalPages)
        setTimeout(refreshStatus, 1000);
    });
  }

  useEffect(() => {
    if (!loading.current) {
      return;
    }
    loading.current = false;

    Scrape.getSearchUrl().then((url: string) => {
      setSearchUrl(url);
    });

    refreshStatus();
  }, []);

  return (
    <>
      {searchUrl == "" && <h1>Loading...</h1>}
      {searchUrl != "" && totalPages!=-1 && (
        <>
          <h1>RAG test on {searchUrl}</h1>
          {totalPages == 0 && (
            <div>
              <div>Scraping initialized...</div>
              <button onClick={() => scrape()}>Continue scraping</button>
            </div>
            )}
          {totalPages != scrapedPages && (
            <div>
              <div>Scraping in progress... {scrapedPages}/{totalPages}</div>
              <button onClick={() => scrape()}>Continue scraping</button>
            </div>
          )}
          {totalPages == scrapedPages && totalPages != indexedPages && (
            <div>
              <div>Indexing in progress... {indexedPages}/{totalPages}</div>
              <button onClick={() => index()}>Continue indexiong</button>
            </div>
          )}
          {totalPages == scrapedPages && totalPages == indexedPages && totalPages>0 && (
            <div className="card">
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!searching)
                  search();
              }}>
                <input
                  type="text"
                  className="input-box"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your search query"
                  />
                <button type="submit" disabled={searching}>
                  {searching ? "searching..." : "search"}
                </button>
              </form>
              <div className="read-the-docs">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>
              {links.length > 0 && (
                <div className="docs-links">
                  <h2>Relevant pages</h2>
                  <ul>
                    {links.map((link, index) => (
                      <li key={index}>
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
