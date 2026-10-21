# Run the latest web app with Docker

Use this workflow to build the current code and open the web app locally. Run the commands from the repository root.

## First run requirements

- Docker Desktop is running.
- `.env.docker` exists and contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The external Docker volume `shared-stuff` exists. Check with:

  ```powershell
  docker volume ls
  ```

  If it is missing, create it once:

  ```powershell
  docker volume create shared-stuff
  ```

## Build and run

Run this command after code changes to rebuild the image and start the latest web app:

```powershell
docker compose --env-file .env.docker up --build
```

The first build can take a few minutes. Keep the terminal open while the app runs. Open this address in your browser:

**http://localhost:3000**

Use `localhost` and `http`. `0.0.0.0` is the address the app listens on inside its container; it is not the browser address.

## View logs

If the app is running in the background or you need another terminal to inspect its output:

```powershell
docker compose --env-file .env.docker logs -f web
```

Press `Ctrl+C` to stop following logs. This does not stop the app.

## Stop the app

If `up` is running in the foreground, press `Ctrl+C` in that terminal. To stop and remove the Compose container from another terminal, run:

```powershell
docker compose --env-file .env.docker down
```

The external `shared-stuff` volume is kept when you run `down`.
