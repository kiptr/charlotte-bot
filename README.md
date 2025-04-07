# Charlotte Bot

A Discord bot for managing gang activities.

## Features

- `/activity` command to add gang activities from a list of gangs
- Gang management commands to add, remove, and view gangs
- Automatically updates and maintains a message with all activities separated by type in a designated channel
- Color-coded embeds for different activity types
- Stores all activities and gangs in JSON files

## Setup Instructions

1. **Prerequisites**

   - [Node.js](https://nodejs.org/) (v16.9.0 or higher)
   - [npm](https://www.npmjs.com/)
   - A Discord account and a server where you have admin permissions

2. **Create a Discord Bot**

   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Navigate to the "Bot" tab and click "Add Bot"
   - Save changes

3. **Get Your Bot Token**

   - In the Bot tab, click "Reset Token" and copy your token
   - Keep this token secret!

4. **Invite the Bot to Your Server**

   - Go to the "OAuth2" tab, then "URL Generator"
   - Select the scopes: "bot" and "applications.commands"
   - Select the bot permissions: "Send Messages", "Embed Links", "Read Message History"
   - Copy the generated URL and open it in your browser to invite the bot to your server

5. **Configure the Bot**

   - Clone this repository
   - Copy the `.env.example` file to a new file called `.env`
   - Fill in your Discord bot token, client ID, and server ID in the `.env` file

6. **Install Dependencies**

   ```bash
   npm install
   ```

7. **Start the Bot**
   ```bash
   npm start
   ```

## Usage

The bot provides the following slash commands:

- `/gangadd name:[gang name]`

  - Adds a new gang to the list
  - The response is only visible to you (ephemeral message)

- `/gangremove name:[gang name]`

  - Removes a gang from the list
  - Uses autocomplete to help select existing gangs
  - The response is only visible to you (ephemeral message)

- `/gangs`

  - Displays a list of all gangs
  - The response is only visible to you (ephemeral message)

- `/activity gangname:[select from list] description:[description] type:[type]`

  - Adds a new activity to the list
  - Gang name is selected from the list of added gangs using autocomplete
  - Description is optional
  - Type must be one of: Our Turn, Opps Turn, EBK, No Beef
  - After adding an activity, the bot automatically updates the activities summary message
  - The response is only visible to you (ephemeral message)

- `/channel type:[type] channel:[channel]`
  - Sets a channel for a specific purpose
  - Currently supported types:
    - `activity`: The channel where the activities summary will be posted and maintained
  - The bot will create a new message in the specified channel and keep it updated
  - The response is only visible to you (ephemeral message)

## Activity Types

The bot organizes activities into four color-coded types:

- **Our Turn** (Green): Activities that your gang needs to handle
- **Opps Turn** (Red): Activities that opposing gangs are handling
- **EBK** (Orange): "Everyone Be Killed" activities
- **No Beef** (Blue): Peaceful activities with no conflict

## Development

To run the bot in development mode with auto-restart on file changes:

```bash
npm run dev
```

## License

ISC
