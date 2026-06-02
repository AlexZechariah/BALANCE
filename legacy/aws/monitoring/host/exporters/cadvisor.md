# cAdvisor

cAdvisor (Container Advisor) collects resource usage and performance metrics
for running Docker containers. It exposes a Prometheus-compatible metrics
endpoint at port 8080.

## Version used

`ghcr.io/google/cadvisor:0.56.2`

## How it runs

cAdvisor runs as a Docker container in the staging and production Compose stacks.
It is NOT publicly exposed.
Prometheus scrapes it on the internal Docker network at `cadvisor:8080`.

## Why privileged mode is required

cAdvisor needs access to host-level cgroup, filesystem, and device paths
to observe container resource usage accurately. The required volume mounts are:

- `/:/rootfs:ro`
- `/var/run:/var/run:ro`
- `/sys:/sys:ro`
- `/var/lib/docker/:/var/lib/docker:ro`
- `/dev/disk/:/dev/disk:ro`

## Metrics available

- container CPU usage per container
- container memory usage per container
- container network RX/TX per container
- container filesystem I/O per container

## Restart after host Docker restart

cAdvisor is set to `restart: unless-stopped` so it comes back automatically
after a host reboot or Docker daemon restart.
