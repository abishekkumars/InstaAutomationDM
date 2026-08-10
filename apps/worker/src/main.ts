function bootstrap(): void {
  console.log('[worker] AutomationDM worker starting...');
  console.log('[worker] No queues are registered yet — see src/processors/README.md.');

  process.on('SIGTERM', () => {
    console.log('[worker] Received SIGTERM, shutting down.');
    process.exit(0);
  });
  process.on('SIGINT', () => {
    console.log('[worker] Received SIGINT, shutting down.');
    process.exit(0);
  });

  process.stdin.resume();
}

bootstrap();
