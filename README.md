# Boulderhalle auf der Synology

Die Halle läuft in einem Container. Im Image steckt nur Node und das Startskript. Der Spielcode liegt in einem Ordner auf der NAS und wird in den Container eingehängt. Spieler und Chat liegen in einer SQLite-Datei in einem zweiten Ordner.

Ein Spiel-Update ist ein `git pull` und ein Neustart des Containers. Das Image wird dafür nicht neu gebaut.

## Ordner

| Pfad | Inhalt |
| --- | --- |
| `/volume1/docker/boulderhalle` | Git-Checkout. Das ist auch der Projektordner. |
| `/volume1/docker/boulderhalle-data` | `gym.sqlite` mit Spielern und Chat. Liegt absichtlich außerhalb des Checkouts. |

Liegt Docker bei dir nicht auf Volume 1, ändere in `docker-compose.yml` nur die Zeile mit `boulderhalle-data`. Der Codepfad `./` folgt dem Projektordner.

Der Datenordner muss auf einem lokalen Volume der NAS liegen.

## Ersteinrichtung

Git muss auf der NAS installiert sein. Per SSH:

```sh
mkdir -p /volume1/docker/boulderhalle-data
cd /volume1/docker
git clone git@github.com:finjaperschmann/climbinggym.git boulderhalle
```

Danach im Container Manager:

1. **Projekt** → **Erstellen**
2. Projektname: `boulderhalle`
3. Pfad: `/volume1/docker/boulderhalle`
4. Die vorhandene `docker-compose.yml` verwenden
5. Projekt starten

Die Halle ist im Browser unter `http://<IP-der-NAS>:8787` erreichbar.

Den Port änderst du nur auf der linken Seite in `docker-compose.yml`, zum Beispiel `"8787:8080"`. Die rechte Seite bleibt `8080`.

Beim ersten Start installiert der Container die npm-Abhängigkeiten in den Checkout. Dafür braucht die NAS kurz Internetzugang. Danach nur noch, wenn sich `package-lock.json` geändert hat.

## Spiel aktualisieren

So aktualisierst du den Code. Dabei wird kein Image gebaut und keins heruntergeladen.

Per SSH:

```sh
cd /volume1/docker/boulderhalle
git pull
```

Anschließend den Container neu starten, damit der laufende Prozess den neuen Code lädt.

Im Container Manager: **Projekt** → `boulderhalle` → **Aktion** → **Neu starten**.

Oder per SSH im Projektordner:

```sh
sudo docker compose restart
```

Auf älteren DSM-Versionen heißt der Befehl `sudo docker-compose restart`.

Danach im Browser neu laden. Die Adresse bleibt `http://<IP-der-NAS>:8787`.

Beim Neustart passiert Folgendes:

- `index.html`, `server.mjs` und die übrigen Dateien kommen aus dem `git pull`.
- Das Startskript prüft `package-lock.json`. Nur bei einer Änderung läuft `npm ci`, und nur dann braucht die NAS Internet.
- Die Datei `gym.sqlite` bleibt liegen, weil sie nicht im Checkout liegt.

## Wann das Image neu geholt werden muss

Nur wenn sich das Startskript oder das Dockerfile geändert hat. Der Spielcode steckt nicht im Image.

```sh
cd /volume1/docker/boulderhalle
sudo docker compose pull
sudo docker compose up -d
```

Das Image heißt `axelperschmann/boulderhalle` auf Docker Hub. Es enthält weder den Spielcode noch Speicherstände.

Ein Push auf `main` veröffentlicht dieses Image neu. Dafür liegt in den GitHub-Repository-Secrets einmalig `DOCKERHUB_TOKEN`: ein Docker-Hub-Access-Token für `axelperschmann` mit Schreibrecht (Docker Hub → Account settings → Personal access tokens).

## Sicherung

Zum Sichern den Container stoppen und den Ordner `/volume1/docker/boulderhalle-data` kopieren. Darin liegen `gym.sqlite` und, solange der Container lief, die Dateien `gym.sqlite-wal` und `gym.sqlite-shm`. Ein `git pull` löscht diesen Ordner nicht.

## Wenn der Container sofort wieder stoppt

Im Projektordner:

```sh
sudo docker compose logs
```

Häufige Ursache: `./` in der `docker-compose.yml` zeigt nicht auf den Git-Checkout, also fehlen `package.json` oder `server.mjs`. Der Datenordner und der Checkout sind zwei verschiedene Pfade.
