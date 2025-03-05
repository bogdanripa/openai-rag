import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./App.css";
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [response, setResponse] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(-1);
  const [scrapedPages, setScrapedPages] = useState(0);
  const [indexedPages, setIndexedPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchUrl, setSearchUrl] = useState("");
  const loading = useRef(true);
  const receiving = useRef(false);

  async function search() {
    setSearching(true);
    setResponse("");
    setLinks([]);
    setSearchParams({ q: query });

    const response = await fetch(import.meta.env.VITE_API_URL + '/search', {
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
    callLonRunning(import.meta.env.VITE_API_URL + '/scrape');
  }

  async function index() {
    callLonRunning(import.meta.env.VITE_API_URL + '/index');
  }

  async function callLonRunning(url: string, cnt:number=3) {
    try {
      const response = await fetch(url);
      if (response.body) {
        receiving.current = true;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = "";
        let finished = false;
  
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break; // Exit loop when the stream is done
          }
          
          // Decode and append the chunk
          const chunk = decoder.decode(value, { stream: true });
          result += chunk;
          if (result.match(/^s \d+\/\d+\n/)) {
            const [scraped, total] = result.match(/^s (\d+)\/(\d+)\n/)?.slice(1) || [];
            setScrapedPages(parseInt(scraped));
            setTotalPages(parseInt(total));
            result = result.replace(/^s \d+\/\d+\n/, "");
            if (scraped == total) {
              receiving.current = false;
              finished = true;
              index();
            }
          }
          if (result.match(/^i \d+\/\d+\n/)) {
            const [indexed, total] = result.match(/^i (\d+)\/(\d+)\n/)?.slice(1) || [];
            setIndexedPages(parseInt(indexed));
            setTotalPages(parseInt(total));
            result = result.replace(/^i \d+\/\d+\n/, "");
            if (indexed == total) {
              receiving.current = false;
              finished = true;
            }
          }
        }
        if (!finished) {
          throw new Error("Stream ended unexpectedly");
        }
      }


    } catch (e) {
      console.error(e);
      setTimeout(() => callLonRunning(url, cnt+1), cnt*1000);
    } 
  }

  async function refreshStatus(firstTime: boolean = false) {
    if (receiving.current)
      return;

    let status:any = await (await fetch(import.meta.env.VITE_API_URL + '/status')).json();

    setTotalPages(status.totalPages);
    setScrapedPages(status.scrapedPages);
    setIndexedPages(status.indexedPages);

    if (firstTime && (status.scrapedPages == 0 || status.totalPages !=  status.scrapedPages)) {
      receiving.current = false;
      scrape();
    } else if (firstTime && status.totalPages == status.scrapedPages && status.totalPages != status.indexedPages) {
      receiving.current = false;
      index();
    }

    if (status.totalPages == 0 || status.scrapedPages != status.totalPages || status.indexedPages != status.totalPages)
      setTimeout(refreshStatus, 3000);
  }

  useEffect(() => {
    if (!loading.current) {
      return;
    }
    loading.current = false;

    fetch(import.meta.env.VITE_API_URL + '/url')
      .then((response:any) => {
        response.text()
          .then((responseTxt:string) => {
            if (response.ok) {
              setSearchUrl(responseTxt);
            }
            else
              alert(responseTxt);
          });
      });
    refreshStatus(true);
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
            </div>
          )}
          {totalPages == scrapedPages && totalPages != indexedPages && (
            <div>
              <div>Indexing in progress... {indexedPages}/{totalPages}</div>
            </div>
          )}
          {totalPages == scrapedPages && totalPages == indexedPages && totalPages>0 && (
            <div className="card search-container">
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
                  value={query}
                  />
                <button 
                  type="submit" 
                  className="search-btn"
                  disabled={searching}>
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
