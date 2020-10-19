## Systemd service

Run the DataDragon server as a Systemd service.

### Install

Use the root user to copy the .service files in this directory to the the systemd system directory.

```bash
cp service/DataDragon.service /etc/systemd/system/
```

Edit the installed service file to

- Set the correct project root path to the root of this repository.
- Run the daemon as the correct user and group (the user who owns this repository)

Then reload the daemon.

```bash
vi /etc/systemd/system/DataDragon.service
systemctl daemon-reload
```

### Run

Run the daemon as a service

```bash
# start the daemon
systemctl start DataDragon
# check the daemon status
systemctl status DataDragon
# restart the daemon
systemctl reload DataDragon
# fully restart the daemon
systemctl restart DataDragon
# stop the daemon
systemctl stop DataDragon
# enable the daemon to start on boot
systemctl enable DataDragon
# check whether the daemon is enabled
systemctl is-enabled DataDragon
```

## SSH Tunneling

Access the remote development server via an SSH tunnel by binding a local port to the remote server port.

### Install

Copy the SSH tunnel script to a convenient location

```bash
cp scripts/ssh-tunnel.sh ~/DataDragon-tunnel.sh
```

Edit the tunnel script to

- Set the correct remote user and host.

Optionally on OS X, change the script file extension to `.command` to allow it to be launched from Finder.

### Run

Run the script to open an SSH tunnel and open the site in your default browser.

```bash
~/DataDragon-tunnel.sh
```

Close the tunnel by typing the `logout` command in the script shell.

