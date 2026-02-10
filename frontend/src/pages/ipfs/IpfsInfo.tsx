import React from 'react';
import { Typography, Box, Alert, Divider } from '@mui/material';
import {
  Chapter,
  CodeBlock,
  EndpointRow,
  ConfigItem,
  InfoPageWrapper,
} from '../../components/shared/InfoChapter';

const chapterIds = [
  'ipfs-overview',
  'ipfs-architecture',
  'ipfs-webui',
  'ipfs-metadata',
  'ipfs-api',
  'ipfs-config',
];

const IpfsInfo: React.FC = () => (
  <InfoPageWrapper
    title="IPFS Explorer"
    subtitle="Dezentraler Zugriff auf Token-Metadaten via Kubo/IPFS"
    chapterIds={chapterIds}
  >
    {({ expandedChapters, handleChapterChange }) => (
      <>
        {/* 1. Was ist IPFS? */}
        <Chapter
          id="ipfs-overview"
          title="Was ist IPFS?"
          icon="🌐"
          expanded={expandedChapters.includes('ipfs-overview')}
          onChange={handleChapterChange('ipfs-overview')}
        >
          <Typography variant="body1" sx={{ mb: 2 }}>
            IPFS (InterPlanetary File System) ist ein dezentrales Peer-to-Peer Netzwerk zum Speichern
            und Teilen von Dateien. Inhalte werden ueber Content-IDs (CIDs) adressiert statt ueber
            Server-URLs - gleicher Inhalt hat immer die gleiche Adresse.
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            In der Pump Platform nutzen wir IPFS, um Token-Metadaten von pump.fun abzurufen.
            Jeder Token hat eine Metadata-URI (z.B. <code>ipfs://bafkrei...</code>) die auf eine
            JSON-Datei mit Name, Symbol, Beschreibung und Bild-Link verweist.
          </Typography>

          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600, fontSize: { xs: '1rem', sm: '1.1rem' } }}>
            Warum ein eigener IPFS-Node?
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2">Kein Rate-Limiting durch oeffentliche Gateways</Typography></li>
            <li><Typography variant="body2">Schnellerer Zugriff durch lokales Caching</Typography></li>
            <li><Typography variant="body2">Unabhaengigkeit von Drittanbieter-Gateways (cloudflare-ipfs, dweb.link)</Typography></li>
            <li><Typography variant="body2">Direkter Zugriff via Kubo RPC API fuer Automatisierung</Typography></li>
          </Box>

          <Alert severity="info" sx={{ mt: 2 }}>
            Kubo (frueher go-ipfs) ist die Referenz-Implementierung eines IPFS-Nodes, geschrieben in Go.
          </Alert>
        </Chapter>

        {/* 2. Architektur */}
        <Chapter
          id="ipfs-architecture"
          title="Architektur"
          icon="🏗️"
          expanded={expandedChapters.includes('ipfs-architecture')}
          onChange={handleChapterChange('ipfs-architecture')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Der IPFS-Node laeuft als Kubo Docker-Container hinter einem nginx Reverse Proxy.
            Alle Requests werden ueber die Platform-Domain geroutet.
          </Typography>

          <CodeBlock>
{`Docker-Setup:
  kubo (ipfs/kubo:latest)
    ├── Port 4001  - Swarm (P2P-Verbindungen zu anderen Nodes)
    ├── Port 5001  - RPC API (Kubo-Steuerung)
    └── Port 8080  - HTTP Gateway (Content abrufen)

nginx Reverse Proxy:
  /api/v0/*   ->  kubo:5001/api/v0/*   (RPC API)
  /ipfs/*     ->  kubo:8080/ipfs/*     (Gateway)
  /webui      ->  kubo:5001/webui      (Web UI Redirect)`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#ff9800' }}>
            Ports
          </Typography>
          <Box sx={{ mb: 2 }}>
            {[
              { port: '4001', desc: 'Swarm - P2P-Verbindungen zu anderen IPFS-Nodes im Netzwerk', color: '#4caf50' },
              { port: '5001', desc: 'RPC API - Kubo-Steuerung (add, cat, pin, config etc.)', color: '#2196f3' },
              { port: '8080', desc: 'HTTP Gateway - Content per CID abrufen (/ipfs/<CID>)', color: '#ff9800' },
            ].map((p) => (
              <Box key={p.port} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, borderLeft: `3px solid ${p.color}`, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: p.color }}>
                  Port {p.port}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.75rem' }}>
                  {p.desc}
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#ff9800' }}>
            nginx Proxy-Regeln
          </Typography>
          <CodeBlock>
{`# RPC API (alle Kubo-Kommandos)
location /api/v0/ {
    proxy_pass http://kubo:5001/api/v0/;
    proxy_set_header Host $host;
    proxy_buffering off;
}

# Gateway (Content per CID)
location /ipfs/ {
    proxy_pass http://kubo:8080/ipfs/;
    proxy_set_header Host $host;
}`}
          </CodeBlock>
        </Chapter>

        {/* 3. IPFS Web UI */}
        <Chapter
          id="ipfs-webui"
          title="IPFS Web UI"
          icon="🖥️"
          expanded={expandedChapters.includes('ipfs-webui')}
          onChange={handleChapterChange('ipfs-webui')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Das Kubo Web UI ist eine eingebaute Browser-Oberflaeche zur Verwaltung des IPFS-Nodes.
            Es wird als iframe im ersten Tab eingebettet.
          </Typography>

          <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 600, fontSize: { xs: '1rem', sm: '1.1rem' } }}>
            Funktionen:
          </Typography>
          <Box component="ul" sx={{ pl: 2, '& li': { mb: 0.5 } }}>
            <li><Typography variant="body2"><strong>Status</strong> - Node-ID, Uptime, Bandbreite, Agent-Version</Typography></li>
            <li><Typography variant="body2"><strong>Files</strong> - IPFS-Dateisystem durchsuchen, Dateien hochladen/herunterladen</Typography></li>
            <li><Typography variant="body2"><strong>Peers</strong> - Verbundene Peers anzeigen, Peer-Geographie auf Weltkarte</Typography></li>
            <li><Typography variant="body2"><strong>Settings</strong> - Kubo-Konfiguration bearbeiten (JSON)</Typography></li>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#ff9800' }}>
            Reverse Proxy Konfiguration
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Das Web UI muss wissen, wo die Kubo RPC API erreichbar ist. Normalerweise
            erwartet es <code>localhost:5001</code>, aber hinter dem Reverse Proxy nutzen wir
            die gleiche Origin-Domain.
          </Typography>
          <CodeBlock>
{`// Automatisch gesetzt beim Laden der IPFS Explorer Seite:
localStorage.setItem('ipfsApi', window.location.origin);

// Das Web UI liest diesen Wert und sendet
// alle RPC-Requests an /api/v0/* statt localhost:5001`}
          </CodeBlock>
        </Chapter>

        {/* 4. Metadata Lookup */}
        <Chapter
          id="ipfs-metadata"
          title="Metadata Lookup"
          icon="🔍"
          expanded={expandedChapters.includes('ipfs-metadata')}
          onChange={handleChapterChange('ipfs-metadata')}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Jeder Token auf pump.fun hat eine Metadata-URI die auf IPFS gespeichert ist.
            Der Metadata Lookup Tab erlaubt das direkte Abrufen und Anzeigen dieser Daten.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#4caf50' }}>
            Unterstuetzte CID-Formate
          </Typography>
          <CodeBlock>
{`ipfs://bafkreig5...         # IPFS URI (Standard bei pump.fun)
bafkreig5...               # Roher CID (Base32, CIDv1)
QmXoypiz...                # Roher CID (Base58, CIDv0)
https://gateway.../ipfs/Qm # Gateway-URL (CID wird extrahiert)`}
          </CodeBlock>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#4caf50' }}>
            Token-Metadata JSON
          </Typography>
          <CodeBlock>
{`{
  "name": "Token Name",
  "symbol": "TKN",
  "description": "Token description...",
  "image": "ipfs://bafkrei...",    // Bild-CID
  "showName": true,
  "twitter": "https://x.com/...",
  "telegram": "https://t.me/...",
  "website": "https://..."
}`}
          </CodeBlock>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Das <code>image</code>-Feld enthaelt eine weitere IPFS-URI zum Token-Bild,
            die automatisch aufgeloest und als Preview angezeigt wird.
          </Typography>

          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: '#4caf50' }}>
            Gateway-Zugriff
          </Typography>
          <CodeBlock>
{`# Content per CID abrufen (ueber lokalen Gateway):
GET /ipfs/<CID>

# Beispiel:
GET /ipfs/bafkreig5xw3zcomhm5ug6haaavxna4d5rss4gxdpysmm3ycep4y7gnhdq
-> JSON mit Token-Metadata`}
          </CodeBlock>
        </Chapter>

        {/* 5. API-Endpunkte (Kubo RPC) */}
        <Chapter
          id="ipfs-api"
          title="API-Endpunkte (Kubo RPC)"
          icon="🔌"
          expanded={expandedChapters.includes('ipfs-api')}
          onChange={handleChapterChange('ipfs-api')}
        >
          <Alert severity="warning" sx={{ mb: 2 }}>
            Alle Kubo RPC-Endpunkte verwenden HTTP <strong>POST</strong> - auch Lese-Operationen.
            Parameter werden als Query-Parameter uebergeben.
          </Alert>

          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Node-Information</Typography>
          <EndpointRow method="POST" path="/api/v0/id" desc="Node-ID, Public Key, Agent-Version" />
          <EndpointRow method="POST" path="/api/v0/version" desc="Kubo-Version & Protokoll-Version" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Netzwerk & Peers</Typography>
          <EndpointRow method="POST" path="/api/v0/swarm/peers" desc="Alle verbundenen Peers auflisten" />
          <EndpointRow method="POST" path="/api/v0/swarm/addrs" desc="Bekannte Peer-Adressen" />
          <EndpointRow method="POST" path="/api/v0/stats/bw" desc="Bandbreiten-Statistiken (In/Out)" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Repository</Typography>
          <EndpointRow method="POST" path="/api/v0/repo/stat" desc="Repo-Groesse, Objekt-Anzahl" />
          <EndpointRow method="POST" path="/api/v0/repo/gc" desc="Garbage Collection ausfuehren" />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Content</Typography>
          <EndpointRow method="POST" path="/api/v0/cat?arg=<CID>" desc="Datei-Inhalt per CID abrufen" />
          <EndpointRow method="POST" path="/api/v0/add" desc="Datei zu IPFS hinzufuegen (multipart)" />
          <EndpointRow method="POST" path="/api/v0/pin/add?arg=<CID>" desc="CID pinnen (lokal behalten)" />
          <EndpointRow method="POST" path="/api/v0/pin/ls" desc="Alle gepinnten CIDs auflisten" />
        </Chapter>

        {/* 6. Konfiguration */}
        <Chapter
          id="ipfs-config"
          title="Konfiguration"
          icon="⚙️"
          expanded={expandedChapters.includes('ipfs-config')}
          onChange={handleChapterChange('ipfs-config')}
        >
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Docker</Typography>
          <ConfigItem
            name="Image"
            value="ipfs/kubo:latest"
            desc="Offizielle Kubo Docker Image"
          />
          <ConfigItem
            name="Volumes"
            value="/data/ipfs"
            desc="Persistenter Speicher fuer IPFS-Repo (Blocks, Datastore, Config)"
          />

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>CORS-Konfiguration</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            CORS muss konfiguriert werden, damit das Web UI und der Browser auf die RPC API
            zugreifen koennen. Dies geschieht beim Container-Start via Init-Script.
          </Typography>
          <CodeBlock>
{`# ipfs-init.sh (Container Entrypoint)
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT","POST","GET"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization"]'

# Gateway ebenfalls oeffnen
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Headers '["X-Requested-With","Range","User-Agent"]'
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Methods '["GET"]'`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>nginx Proxy Headers</Typography>
          <CodeBlock>
{`# Wichtige Headers fuer den Reverse Proxy:
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# Buffering deaktivieren fuer Streaming-Responses:
proxy_buffering off;`}
          </CodeBlock>

          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 'bold' }}>Environment</Typography>
          <ConfigItem
            name="IPFS_PROFILE"
            value="server"
            desc="Kubo-Profil: 'server' deaktiviert lokale Discovery, optimiert fuer Server-Betrieb"
          />
          <ConfigItem
            name="IPFS_PATH"
            value="/data/ipfs"
            desc="Pfad zum IPFS-Repository im Container"
          />
        </Chapter>
      </>
    )}
  </InfoPageWrapper>
);

export default IpfsInfo;
