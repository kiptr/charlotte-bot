import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to database files
const ACTIVITIES_FILE = path.join(__dirname, '..', 'activities.json');
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const GANGS_FILE = path.join(__dirname, '..', 'gangs.json');

// Create a new client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

// Array of valid activity types
const VALID_TYPES = ['Our Turn', 'Opps Turn', 'EBK', 'No Beef'];

// Function to load activities from file
async function loadActivities() {
  try {
    const data = await fs.readFile(ACTIVITIES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

// Function to save activities to file
async function saveActivities(activities) {
  await fs.writeFile(ACTIVITIES_FILE, JSON.stringify(activities, null, 2), 'utf8');
}

// Function to load gangs from file
async function loadGangs() {
  try {
    const data = await fs.readFile(GANGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

// Function to save gangs to file
async function saveGangs(gangs) {
  await fs.writeFile(GANGS_FILE, JSON.stringify(gangs, null, 2), 'utf8');
}

// Function to load config from file
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return default config
    return { 
      channels: {}
    };
  }
}

// Function to save config to file
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Function to update the activities message
async function updateActivitiesMessage() {
  try {
    const config = await loadConfig();
    
    // If no activity channel is set, can't update message
    if (!config.channels.activity || !config.channels.activity.channelId) {
      console.log('No activity channel set. Use /channel type:activity channel:#your-channel command first.');
      return;
    }
    
    const activities = await loadActivities();
    
    // Group activities by type
    const groupedActivities = {};
    VALID_TYPES.forEach(type => {
      groupedActivities[type] = activities.filter(a => a.type === type);
    });
    
    // Create embeds for each type
    const embeds = [];
    
    for (const type of VALID_TYPES) {
      const typeActivities = groupedActivities[type];
      
      // Sort activities by creation date (oldest first instead of newest first)
      typeActivities.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Create embed for this type
      const embed = new EmbedBuilder()
        .setColor(getColorForType(type))
        .setTitle(`${type} Activities`)
        .setTimestamp();
      
      if (typeActivities.length === 0) {
        embed.setDescription('No activities in this category.');
      } else {
        // Add activity fields (limit to 10 per type to avoid embed limits)
        const displayActivities = typeActivities.slice(0, 10);
        
        // Instead of using fields, add each activity as a line in the description
        const activityLines = displayActivities.map((activity, index) => {
          const date = new Date(activity.createdAt);
          // Format date as dd/mm/yyyy
          const formattedDate = `${('0' + date.getDate()).slice(-2)}/${('0' + (date.getMonth() + 1)).slice(-2)}/${date.getFullYear()}`;
          // Only show brackets with description if a description exists
          const descriptionText = activity.description ? ` [${activity.description}]` : '';
          return `${index + 1}. **${activity.gangName}**${descriptionText} (${formattedDate})`;
        });
        
        // Join without extra blank line
        embed.setDescription(activityLines.join('\n') || 'No activities in this category.');
        
        if (typeActivities.length > 10) {
          embed.setFooter({ text: `Showing 10/${typeActivities.length} activities` });
        }
      }
      
      embeds.push(embed);
    }
    
    // Get the channel
    const channelId = config.channels.activity.channelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error('Activity channel not found.');
      return;
    }
    
    // If we already have a message, edit it; otherwise create a new one
    if (config.channels.activity.messageId) {
      try {
        const message = await channel.messages.fetch(config.channels.activity.messageId);
        await message.edit({ embeds: embeds });
        console.log('Activities message updated successfully.');
      } catch (error) {
        console.error('Could not find the activities message. Creating a new one.');
        const message = await channel.send({ embeds: embeds });
        config.channels.activity.messageId = message.id;
        await saveConfig(config);
        console.log('New activities message created.');
      }
    } else {
      const message = await channel.send({ embeds: embeds });
      config.channels.activity.messageId = message.id;
      await saveConfig(config);
      console.log('Initial activities message created.');
    }
  } catch (error) {
    console.error('Error updating activities message:', error);
  }
}

// Helper function to get color for each type
function getColorForType(type) {
  switch (type) {
    case 'Our Turn':
      return '#00FF00'; // Green
    case 'Opps Turn':
      return '#FF0000'; // Red
    case 'EBK':
      return '#FFA500'; // Orange
    case 'No Beef':
      return '#0000FF'; // Blue
    default:
      return '#FFFFFF'; // White
  }
}

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Add a gang activity to the list')
    .addStringOption(option =>
      option.setName('gangname')
        .setDescription('The name of the gang')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of activity')
        .setRequired(true)
        .addChoices(
          { name: 'Our Turn', value: 'Our Turn' },
          { name: 'Opps Turn', value: 'Opps Turn' },
          { name: 'EBK', value: 'EBK' },
          { name: 'No Beef', value: 'No Beef' }
        ))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Description of the activity (optional)')
        .setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Set a channel for a specific purpose')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of content to display in this channel')
        .setRequired(true)
        .addChoices(
          { name: 'Activity list', value: 'activity' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to use')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('gangadd')
    .setDescription('Add a new gang to the list')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the gang to add')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('gangremove')
    .setDescription('Remove a gang from the list')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the gang to remove')
        .setRequired(true)
        .setAutocomplete(true)),
  
  new SlashCommandBuilder()
    .setName('gangs')
    .setDescription('View all gangs in the list')
];

// Register slash commands when the bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  try {
    // Create activities file if it doesn't exist
    try {
      await fs.access(ACTIVITIES_FILE);
    } catch {
      await saveActivities([]);
    }
    
    // Create gangs file if it doesn't exist
    try {
      await fs.access(GANGS_FILE);
    } catch {
      await saveGangs([]);
    }
    
    // Create config file if it doesn't exist
    try {
      await fs.access(CONFIG_FILE);
    } catch {
      await saveConfig({
        channels: {}
      });
    }
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    
    console.log('Successfully reloaded application (/) commands.');
    
    // Update activities message on startup
    const config = await loadConfig();
    if (config.channels && config.channels.activity && config.channels.activity.channelId) {
      await updateActivitiesMessage();
    }
  } catch (error) {
    console.error(error);
  }
});

// Handle autocomplete interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;
  
  const { commandName, options } = interaction;
  
  if (commandName === 'activity' && options.getFocused(true).name === 'gangname') {
    try {
      const gangs = await loadGangs();
      const focusedValue = options.getFocused();
      
      // Filter gangs based on user input
      const filtered = gangs.filter(gang => 
        gang.toLowerCase().includes(focusedValue.toLowerCase())
      );
      
      // Respond with up to 25 matching gangs
      await interaction.respond(
        filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
      );
    } catch (error) {
      console.error('Error handling autocomplete interaction:', error);
    }
  } else if (commandName === 'gangremove' && options.getFocused(true).name === 'name') {
    try {
      const gangs = await loadGangs();
      const focusedValue = options.getFocused();
      
      // Filter gangs based on user input
      const filtered = gangs.filter(gang => 
        gang.toLowerCase().includes(focusedValue.toLowerCase())
      );
      
      // Respond with up to 25 matching gangs
      await interaction.respond(
        filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
      );
    } catch (error) {
      console.error('Error handling autocomplete interaction:', error);
    }
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'activity') {
    const gangName = interaction.options.getString('gangname');
    const type = interaction.options.getString('type');
    const description = interaction.options.getString('description') || ''; // Default to empty string if not provided
    
    try {
      // Check if gang exists
      const gangs = await loadGangs();
      if (!gangs.includes(gangName)) {
        return interaction.reply({
          content: `Gang "${gangName}" not found. Use /gangadd to add it first.`,
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Load existing activities
      const activities = await loadActivities();
      
      // Check if an activity for this gang already exists
      const existingActivityIndex = activities.findIndex(activity => activity.gangName === gangName);
      
      let newActivity;
      let updateMessage = 'Activity Added';
      
      if (existingActivityIndex !== -1) {
        // Update existing activity
        newActivity = {
          ...activities[existingActivityIndex],
          description,
          type,
          updatedAt: new Date().toISOString(),
          updatedBy: interaction.user.id
        };
        
        // Replace the existing activity
        activities[existingActivityIndex] = newActivity;
        updateMessage = 'Activity Updated';
      } else {
        // Create new activity
        newActivity = {
          id: Date.now().toString(),
          gangName,
          description,
          type,
          createdAt: new Date().toISOString(),
          createdBy: interaction.user.id
        };
        
        // Add to activities list
        activities.push(newActivity);
      }
      
      // Save updated list
      await saveActivities(activities);
      
      // Create embedded response for the command user
      const date = new Date();
      const formattedDate = `${('0' + date.getDate()).slice(-2)}/${('0' + (date.getMonth() + 1)).slice(-2)}/${date.getFullYear()}`;
      
      // Only show brackets with description if a description exists
      const descriptionText = description ? ` [${description}]` : '';
      
      const embed = new EmbedBuilder()
        .setColor(getColorForType(type))
        .setTitle(updateMessage)
        .setDescription(`**${gangName}**${descriptionText} (${formattedDate})`)
        .setFooter({ text: `Type: ${type}` })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      
      // Update the activities message
      await updateActivitiesMessage();
    } catch (error) {
      console.error('Error handling activity command:', error);
      await interaction.reply({
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (commandName === 'channel') {
    try {
      const channelType = interaction.options.getString('type');
      const channel = interaction.options.getChannel('channel');
      
      // Load existing config
      const config = await loadConfig();
      
      // Initialize channels object if it doesn't exist
      if (!config.channels) {
        config.channels = {};
      }
      
      // Set channel for the specified type
      if (channelType === 'activity') {
        config.channels.activity = {
          channelId: channel.id,
          messageId: null // Reset message ID so a new message is created
        };
        
        await saveConfig(config);
        
        // Create initial activities message
        await updateActivitiesMessage();
        
        await interaction.reply({
          content: `Activities will now be posted and updated in ${channel}.`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: `Unknown channel type: ${channelType}`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('Error handling channel command:', error);
      await interaction.reply({
        content: 'There was an error while setting the channel!',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (commandName === 'gangadd') {
    try {
      const gangName = interaction.options.getString('name');
      
      // Load existing gangs
      const gangs = await loadGangs();
      
      // Check if gang already exists
      if (gangs.includes(gangName)) {
        return interaction.reply({
          content: `Gang "${gangName}" already exists.`,
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Add gang to list
      gangs.push(gangName);
      
      // Save updated list
      await saveGangs(gangs);
      
      await interaction.reply({
        content: `Gang "${gangName}" has been added to the list.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling gangadd command:', error);
      await interaction.reply({
        content: 'There was an error while adding the gang!',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (commandName === 'gangremove') {
    try {
      const gangName = interaction.options.getString('name');
      
      // Load existing gangs
      const gangs = await loadGangs();
      
      // Check if gang exists
      if (!gangs.includes(gangName)) {
        return interaction.reply({
          content: `Gang "${gangName}" not found.`,
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Remove gang from list
      const updatedGangs = gangs.filter(g => g !== gangName);
      
      // Save updated list
      await saveGangs(updatedGangs);
      
      await interaction.reply({
        content: `Gang "${gangName}" has been removed from the list.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling gangremove command:', error);
      await interaction.reply({
        content: 'There was an error while removing the gang!',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (commandName === 'gangs') {
    try {
      // Load existing gangs
      const gangs = await loadGangs();
      
      if (gangs.length === 0) {
        return interaction.reply({
          content: 'No gangs have been added yet. Use /gangadd to add gangs.',
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Create embed with gang list
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Gang List')
        .setDescription(gangs.join('\n'))
        .setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling gangs command:', error);
      await interaction.reply({
        content: 'There was an error while retrieving the gang list!',
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 