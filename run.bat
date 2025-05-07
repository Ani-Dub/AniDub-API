docker build -t anidub-api .
docker stop anidub-api
docker rm anidub-api
docker run --env=NODE_ENV=production --env=DB_HOST=host.docker.internal --env=DB_USERNAME=root --env=DB_PASSWORD=root -p 3000:3000 --restart=unless-stopped -d --name=anidub-api anidub-api
