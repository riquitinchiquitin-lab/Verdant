# Proxmox Helper Scripts

This directory contains scripts to automate the installation of Verdant on a Proxmox VE host using a Linux Container (LXC).

## Files

*   `proxmox_helper.sh`: The main script to be run on the Proxmox host. It creates the LXC and triggers the installation.
*   `install.sh`: The installation script that runs inside the LXC to set up the environment and the application.

## Usage

On your Proxmox host, run:

```bash
curl -sSL https://raw.githubusercontent.com/riquitinchiquitin-lab/verdant/main/scripts/proxmox/proxmox_helper.sh | bash
```

## Customization

You can pass arguments to `proxmox_helper.sh` to customize the LXC:

```bash
./proxmox_helper.sh <LXC_ID> <LXC_NAME> <LXC_STORAGE> <LXC_BRIDGE> <LXC_PASSWORD>
```

Example:

```bash
./proxmox_helper.sh 200 my-verdant local-zfs vmbr0 mysecretpassword
```
