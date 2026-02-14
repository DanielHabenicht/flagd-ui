FROM mcr.microsoft.com/azure-cli:latest

# Copy the demo flag file
COPY flags/demo.flagd.json /tmp/demo.flagd.json

# Copy the init script
COPY services/azurite-init/init.sh /init.sh
RUN chmod +x /init.sh

# Set environment to disable SSL verification for local azurite
ENV AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1

CMD ["/init.sh"]
