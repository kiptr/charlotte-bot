import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
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
    GatewayIntentBits.GuildPresences, // Add Presence intent to detect streaming status
  ]
});

// Array of valid activity types
const VALID_TYPES = ['Our Turn (Giliran Kita)', 'Opps Turn (Giliran Mereka)', 'EBK', 'No Beef'];

// Store the current page for each activity type
const activityPages = {
  'Our Turn (Giliran Kita)': 0,
  'Opps Turn (Giliran Mereka)': 0,
  'EBK': 0,
  'No Beef': 0
};

// Activities per page
const ACTIVITIES_PER_PAGE = 25;

// Define old and new type mappings for migration
const TYPE_MIGRATIONS = {
  'Our Turn': 'Our Turn (Giliran Kita)',
  'Opps Turn': 'Opps Turn (Giliran Mereka)'
};

// Define activity type codes for shorter IDs
const TYPE_CODES = {
  'our_turn': 'Our Turn (Giliran Kita)',
  'opps_turn': 'Opps Turn (Giliran Mereka)',
  'ebk': 'EBK',
  'no_beef': 'No Beef'
};

// Reverse map for looking up code by type
const TYPE_BY_CODE = Object.entries(TYPE_CODES).reduce((acc, [code, type]) => {
  acc[type] = code;
  return acc;
}, {});

// Track users who are currently streaming to avoid duplicate notifications
const activeStreamers = new Set();

// Function to format date to Indonesia time (GMT+7)
function formatDateToIndonesiaTime(dateString) {
  const date = new Date(dateString);
  // Adjust to GMT+7 (Indonesia Western Time)
  const jakartaTime = new Date(date.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
  
  // Format as dd/mm/yyyy
  const day = ('0' + jakartaTime.getUTCDate()).slice(-2);
  const month = ('0' + (jakartaTime.getUTCMonth() + 1)).slice(-2);
  const year = jakartaTime.getUTCFullYear();
  
  return `${day}/${month}/${year}`;
}

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
    const components = [];
    
    for (const type of VALID_TYPES) {
      const typeActivities = groupedActivities[type];
      
      // Sort activities by creation date (oldest first instead of newest first)
      typeActivities.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Calculate pagination
      const totalPages = Math.ceil(typeActivities.length / ACTIVITIES_PER_PAGE);
      const currentPage = activityPages[type];
      // Ensure current page is valid
      activityPages[type] = Math.min(Math.max(0, currentPage), Math.max(0, totalPages - 1));
      
      // Calculate the range for the current page
      const startIdx = activityPages[type] * ACTIVITIES_PER_PAGE;
      const endIdx = Math.min(startIdx + ACTIVITIES_PER_PAGE, typeActivities.length);
      const displayActivities = typeActivities.slice(startIdx, endIdx);
      
      // Create embed for this type
      const embed = new EmbedBuilder()
        .setColor(getColorForType(type))
        .setTitle(`${type} Activities`)
        .setTimestamp();
      
      if (typeActivities.length === 0) {
        embed.setDescription('No activities in this category.');
      } else {
        // Create activity lines for the current page
        const activityLines = displayActivities.map((activity, index) => {
          // Format date using Indonesia time
          const formattedDate = formatDateToIndonesiaTime(activity.createdAt);
          // Only show brackets with description if a description exists
          const descriptionText = activity.description ? ` [${activity.description}]` : '';
          // Adjust index to show the actual number in the full list
          return `${startIdx + index + 1}. **${activity.gangName}**${descriptionText} (${formattedDate})`;
        });
        
        // Join without extra blank line
        embed.setDescription(activityLines.join('\n') || 'No activities in this category.');
        
        if (totalPages > 1) {
          embed.setFooter({ text: `Page ${activityPages[type] + 1}/${totalPages} • Total: ${typeActivities.length} activities` });
        }
      }
      
      embeds.push(embed);
      
      // Create pagination buttons for this type
      if (typeActivities.length > ACTIVITIES_PER_PAGE) {
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`first_${type}`)
              .setLabel('⏮️ First')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(activityPages[type] === 0),
            new ButtonBuilder()
              .setCustomId(`prev_${type}`)
              .setLabel('◀️ Previous')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(activityPages[type] === 0),
            new ButtonBuilder()
              .setCustomId(`next_${type}`)
              .setLabel('Next ▶️')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(activityPages[type] >= totalPages - 1),
            new ButtonBuilder()
              .setCustomId(`last_${type}`)
              .setLabel('Last ⏭️')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(activityPages[type] >= totalPages - 1)
          );
        
        components.push(row);
      }
    }
    
    // Add quick add buttons row at the bottom
    const quickAddRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('add_our_turn')
          .setLabel('Add: Our Turn (Giliran Kita)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('add_opps_turn')
          .setLabel('Add: Opps Turn (Giliran Mereka)')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('add_ebk')
          .setLabel('Add: EBK')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('add_no_beef')
          .setLabel('Add: No Beef')
          .setStyle(ButtonStyle.Secondary)
      );
    
    components.push(quickAddRow);
    
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
        await message.edit({ embeds: embeds, components: components });
        console.log('Activities message updated successfully.');
      } catch (error) {
        console.error('Could not find the activities message. Creating a new one.');
        const message = await channel.send({ embeds: embeds, components: components });
        config.channels.activity.messageId = message.id;
        await saveConfig(config);
        console.log('New activities message created.');
      }
    } else {
      const message = await channel.send({ embeds: embeds, components: components });
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
  // Check if this is a type code and convert to full type if needed
  const fullType = TYPE_CODES[type] || type;
  
  switch (fullType) {
    case 'Our Turn (Giliran Kita)':
      return '#00FF00'; // Green
    case 'Opps Turn (Giliran Mereka)':
      return '#FF0000'; // Red
    case 'EBK':
      return '#FFA500'; // Orange
    case 'No Beef':
      return '#808080'; // Gray
    default:
      return '#0099ff'; // Default blue
  }
}

// Function to migrate activity types
async function migrateActivityTypes() {
  try {
    console.log('Checking for activities that need migration...');
    const activities = await loadActivities();
    let migrationNeeded = false;
    
    // Check if any activities use old type names
    activities.forEach(activity => {
      if (TYPE_MIGRATIONS[activity.type]) {
        migrationNeeded = true;
        activity.type = TYPE_MIGRATIONS[activity.type];
      }
    });
    
    // If migration was needed, save the updated activities
    if (migrationNeeded) {
      await saveActivities(activities);
      console.log('Successfully migrated activity types to include Indonesian translations!');
    } else {
      console.log('No activity type migration needed.');
    }
  } catch (error) {
    console.error('Error during activity type migration:', error);
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
          { name: 'Our Turn (Giliran Kita)', value: 'Our Turn (Giliran Kita)' },
          { name: 'Opps Turn (Giliran Mereka)', value: 'Opps Turn (Giliran Mereka)' },
          { name: 'EBK', value: 'EBK' },
          { name: 'No Beef', value: 'No Beef' }
        ))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Description of the activity (optional)')
        .setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('quickadd')
    .setDescription('Add a gang activity using buttons for easier input'),
  
  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Set a channel for a specific purpose')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('The type of content to display in this channel')
        .setRequired(true)
        .addChoices(
          { name: 'Activity list', value: 'activity' },
          { name: 'Stream notifications', value: 'stream' }
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
    .setDescription('View all gangs in the list'),
  
  new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Register a YouTube stream link for notifications')
    .addStringOption(option =>
      option.setName('link')
        .setDescription('The YouTube stream link')
        .setRequired(true))
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
    
    // Migrate existing activities to new type names
    await migrateActivityTypes();
    
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

// Handle button interactions for pagination
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  
  // Check if this is a pagination button
  if (interaction.customId.startsWith('first_') || 
      interaction.customId.startsWith('prev_') || 
      interaction.customId.startsWith('next_') || 
      interaction.customId.startsWith('last_')) {
    try {
      const [action, type] = interaction.customId.split('_');
      
      // Make sure it's a valid type
      if (!VALID_TYPES.includes(type)) return;
      
      // Determine the new page based on the button pressed
      const activities = await loadActivities();
      const typeActivities = activities.filter(a => a.type === type);
      const totalPages = Math.ceil(typeActivities.length / ACTIVITIES_PER_PAGE);
      
      switch (action) {
        case 'first':
          activityPages[type] = 0;
          break;
        case 'prev':
          activityPages[type] = Math.max(0, activityPages[type] - 1);
          break;
        case 'next':
          activityPages[type] = Math.min(totalPages - 1, activityPages[type] + 1);
          break;
        case 'last':
          activityPages[type] = Math.max(0, totalPages - 1);
          break;
        default:
          return;
      }
      
      // Acknowledge the interaction
      await interaction.deferUpdate();
      
      // Update the activities message with the new page
      await updateActivitiesMessage();
    } catch (error) {
      console.error('Error handling pagination button interaction:', error);
      try {
        await interaction.reply({
          content: 'There was an error while handling the pagination!',
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        // If replying fails, try to update the interaction
        try {
          await interaction.update({
            content: 'There was an error while handling the pagination!',
            components: []
          });
        } catch (innerError) {
          console.error('Failed to respond to button interaction:', innerError);
        }
      }
    }
  }
  
  // Check if this is an activity add button
  if (interaction.customId.startsWith('add_') && !interaction.customId.startsWith('add_gang_') && !interaction.customId.startsWith('add_first_gang_')) {
    try {
      const typeCode = interaction.customId.substring(4); // Get the activity type code from the button ID
      const type = TYPE_CODES[typeCode] || typeCode; // Convert to full type name or use as is
      
      // Load gangs for the select menu
      const gangs = await loadGangs();
      
      if (gangs.length === 0) {
        // Create "Add Gang" button
        const addGangButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`add_first_gang_${typeCode}`)
              .setLabel("Add your first gang")
              .setStyle(ButtonStyle.Primary)
          );
          
        return interaction.reply({
          content: 'No gangs have been added yet. Add your first gang:',
          components: [addGangButton],
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Create a modal for searching gangs with shortened title
      const modal = new ModalBuilder()
        .setCustomId(`search_gangs_${typeCode}`) // Use shorter code in the ID
        .setTitle(`Gang Search - ${typeCode.replace(/_/g, ' ')}`); // Short title under 45 chars
      
      // Create gang search input
      const searchInput = new TextInputBuilder()
        .setCustomId('gang_search')
        .setLabel('Gang Name (type to filter)')
        .setPlaceholder('Type to filter or leave empty to see all gangs')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      
      // Add inputs to the modal
      const searchRow = new ActionRowBuilder().addComponents(searchInput);
      
      modal.addComponents(searchRow);
      
      // Show the modal
      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error handling activity add button:', error);
      try {
        await interaction.reply({
          content: 'There was an error while showing the gang search!',
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        console.error('Failed to respond to button interaction:', e);
      }
    }
  }
  
  // Handle "Add Gang" button
  if (interaction.customId.startsWith('add_gang_') || interaction.customId.startsWith('add_first_gang_')) {
    try {
      let typeCode = '';
      let gangNameSuggestion = '';
      
      if (interaction.customId.startsWith('add_gang_')) {
        // Extract type code and suggested name
        const parts = interaction.customId.substring('add_gang_'.length).split('_');
        typeCode = parts[0];
        gangNameSuggestion = parts.slice(1).join('_');
      } else { // add_first_gang_
        typeCode = interaction.customId.substring('add_first_gang_'.length);
      }
      
      // Create a modal for adding a new gang
      const modal = new ModalBuilder()
        .setCustomId(`add_gang_modal_${typeCode}`)
        .setTitle("Add New Gang");
      
      // Create gang name input
      const gangNameInput = new TextInputBuilder()
        .setCustomId('gang_name')
        .setLabel('Gang Name')
        .setPlaceholder('Enter the gang name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(gangNameSuggestion); // Pre-fill with suggested name if available
      
      // Add inputs to the modal
      const gangNameRow = new ActionRowBuilder().addComponents(gangNameInput);
      
      modal.addComponents(gangNameRow);
      
      // Show the modal
      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error handling add gang button:', error);
      try {
        await interaction.reply({
          content: 'There was an error while showing the add gang form!',
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        console.error('Failed to respond to button interaction:', e);
      }
    }
  }
});

// Handle select menu interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  
  // Handle gang selection
  if (interaction.customId.startsWith('select_gang_')) {
    try {
      const typeCode = interaction.customId.substring('select_gang_'.length);
      const type = TYPE_CODES[typeCode] || typeCode; // Convert to full type name
      const gangName = interaction.values[0]; // Get the selected gang
      
      // Create a modal for description
      const modal = new ModalBuilder()
        .setCustomId(`activity_modal_${typeCode}_${gangName}`) // Use type code in ID
        .setTitle(`Add ${typeCode.replace(/_/g, ' ')} - ${gangName.substring(0, 20)}${gangName.length > 20 ? '...' : ''}`);
      
      // Create description input
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (optional)')
        .setPlaceholder('Enter a description for this activity')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
      
      // Add inputs to the modal
      const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
      
      modal.addComponents(descriptionRow);
      
      // Show the modal
      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error handling gang selection:', error);
      await interaction.reply({
        content: 'There was an error while processing your gang selection!',
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

// Handle modal submissions
client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;
  
  // Handle direct activity modal submission
  if (interaction.customId.startsWith('activity_modal_direct_')) {
    try {
      const type = interaction.customId.substring('activity_modal_direct_'.length);
      
      // Get form values
      const gangName = interaction.fields.getTextInputValue('gangname');
      const description = interaction.fields.getTextInputValue('description');
      
      // Check if gang exists
      const gangs = await loadGangs();
      if (!gangs.includes(gangName)) {
        // Get the type code for the button ID
        const typeCode = TYPE_BY_CODE[type] || type.toLowerCase().replace(/\s+/g, '_');
        
        // Create "Add Gang" button
        const addGangButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`add_gang_${typeCode}_${gangName}`)
              .setLabel(`Add "${gangName}" as new gang`)
              .setStyle(ButtonStyle.Primary)
          );
        
        return interaction.reply({
          content: `Gang "${gangName}" not found. Would you like to add it as a new gang?`,
          components: [addGangButton],
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
      
      // Create embedded response for the user
      const date = new Date();
      const formattedDate = formatDateToIndonesiaTime(date.toISOString());
      
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
      console.error('Error handling direct activity modal submission:', error);
      await interaction.reply({
        content: 'There was an error while processing your activity submission!',
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }
  
  // Handle gang search submission
  if (interaction.customId.startsWith('search_gangs_')) {
    try {
      const typeCode = interaction.customId.substring('search_gangs_'.length);
      const type = TYPE_CODES[typeCode] || typeCode; // Convert to full type name
      const searchQuery = interaction.fields.getTextInputValue('gang_search').toLowerCase();
      
      // Load all gangs
      const gangs = await loadGangs();
      
      // Filter gangs based on search query
      let filteredGangs = gangs;
      if (searchQuery.trim() !== '') {
        filteredGangs = gangs.filter(gang => 
          gang.toLowerCase().includes(searchQuery)
        );
      }
      
      // If no matches found, show add gang button
      if (filteredGangs.length === 0) {
        // Create "Add Gang" button
        const addGangButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`add_gang_${typeCode}_${searchQuery.trim()}`)
              .setLabel(`Add "${searchQuery.trim()}" as new gang`)
              .setStyle(ButtonStyle.Primary)
          );
        
        return interaction.reply({
          content: `No gangs found matching "${searchQuery}". Would you like to add it as a new gang?`,
          components: [addGangButton],
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Create a select menu with the filtered gangs
      const selectMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_gang_${typeCode}`) // Use type code in ID
            .setPlaceholder('Select a gang')
            .addOptions(
              filteredGangs.map(gang => ({
                label: gang,
                value: gang
              })).slice(0, 25) // Discord limits to 25 options
            )
        );
      
      // Show search results
      const resultMessage = searchQuery.trim() !== '' 
        ? `Found ${filteredGangs.length} ${filteredGangs.length === 1 ? 'gang' : 'gangs'} matching "${searchQuery}"`
        : 'Showing all gangs';
      
      await interaction.reply({
        content: `${resultMessage}. Please select a gang for **${type}** activity:`,
        components: [selectMenu],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling gang search:', error);
      await interaction.reply({
        content: 'There was an error while processing your gang search!',
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }
  
  // Handle activity form submission
  if (interaction.customId.startsWith('activity_modal_')) {
    try {
      // Extract type code and gang name from the modal ID
      const parts = interaction.customId.substring('activity_modal_'.length).split('_');
      const typeCode = parts[0];
      const type = TYPE_CODES[typeCode] || typeCode; // Convert to full type name
      const gangName = parts.slice(1).join('_'); // In case the gang name contains underscores
      
      // Get the description from the form
      const description = interaction.fields.getTextInputValue('description');
      
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
      
      // Create embedded response for the user
      const date = new Date();
      const formattedDate = formatDateToIndonesiaTime(date.toISOString());
      
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
      console.error('Error handling modal submission:', error);
      await interaction.reply({
        content: 'There was an error while processing your activity submission!',
        flags: MessageFlags.Ephemeral
      });
    }
  }
  
  // Add a new handler for the "add gang modal" submission
  if (interaction.customId.startsWith('add_gang_modal_')) {
    try {
      const typeCode = interaction.customId.substring('add_gang_modal_'.length);
      const type = TYPE_CODES[typeCode] || typeCode; // Convert to full type name
      
      // Get the gang name from the form
      const gangName = interaction.fields.getTextInputValue('gang_name').trim();
      
      if (!gangName) {
        return interaction.reply({
          content: 'Gang name cannot be empty.',
          flags: MessageFlags.Ephemeral
        });
      }
      
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
      
      // Create a modal for adding activity description
      const activityModal = new ModalBuilder()
        .setCustomId(`activity_modal_${typeCode}_${gangName}`) // Use type code in ID
        .setTitle(`Add ${typeCode.replace(/_/g, ' ')} - ${gangName.substring(0, 20)}${gangName.length > 20 ? '...' : ''}`);
      
      // Create description input
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (optional)')
        .setPlaceholder('Enter a description for this activity')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
      
      // Add inputs to the modal
      const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
      
      activityModal.addComponents(descriptionRow);
      
      // Acknowledge the gang addition and show the activity modal
      await interaction.reply({
        content: `Gang "${gangName}" has been added to the list. Now enter activity details:`,
        flags: MessageFlags.Ephemeral
      });
      
      // Show the activity modal after a short delay
      setTimeout(async () => {
        try {
          await interaction.showModal(activityModal);
        } catch (error) {
          console.error('Error showing activity modal after gang addition:', error);
        }
      }, 500);
    } catch (error) {
      console.error('Error handling add gang modal submission:', error);
      await interaction.reply({
        content: 'There was an error while adding the gang!',
        flags: MessageFlags.Ephemeral
      });
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
        // Get the type code for the button ID
        const typeCode = TYPE_BY_CODE[type] || type.toLowerCase().replace(/\s+/g, '_');
        
        // Create "Add Gang" button
        const addGangButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`add_gang_${typeCode}_${gangName}`)
              .setLabel(`Add "${gangName}" as new gang`)
              .setStyle(ButtonStyle.Primary)
          );
        
        return interaction.reply({
          content: `Gang "${gangName}" not found. Would you like to add it as a new gang?`,
          components: [addGangButton],
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
      // Format date using Indonesia time
      const formattedDate = formatDateToIndonesiaTime(date.toISOString());
      
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
  } else if (commandName === 'quickadd') {
    try {
      // Create buttons for each activity type
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('add_our_turn')
            .setLabel('Our Turn (Giliran Kita)')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_opps_turn')
            .setLabel('Opps Turn (Giliran Mereka)')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('add_ebk')
            .setLabel('EBK')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('add_no_beef')
            .setLabel('No Beef')
            .setStyle(ButtonStyle.Secondary)
        );

      // Send message with buttons
      await interaction.reply({
        content: 'Select type of activity to add. A form will appear where you can enter the gang name and description:',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling quickadd command:', error);
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
      } else if (channelType === 'stream') {
        config.channels.stream = {
          channelId: channel.id
        };
        
        await saveConfig(config);
        
        await interaction.reply({
          content: `Stream notifications will now be posted in ${channel}.`,
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
  } else if (commandName === 'stream') {
    try {
      const streamLink = interaction.options.getString('link');
      
      // Validate that it's a YouTube link
      if (!streamLink.includes('youtube.com') && !streamLink.includes('youtu.be')) {
        return interaction.reply({
          content: 'Please provide a valid YouTube link.',
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Load existing config
      const config = await loadConfig();
      
      // Check if stream channel is configured
      if (!config.channels || !config.channels.stream || !config.channels.stream.channelId) {
        return interaction.reply({
          content: 'No stream notification channel has been set. Use `/channel type:stream channel:#your-channel` first.',
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Get the stream notification channel
      const streamChannel = await client.channels.fetch(config.channels.stream.channelId);
      if (!streamChannel) {
        return interaction.reply({
          content: 'Could not find the configured stream notification channel. Please check the channel settings.',
          flags: MessageFlags.Ephemeral
        });
      }
      
      // Create an embedded announcement
      const embed = new EmbedBuilder()
        .setColor('#FF0000') // YouTube red
        .setTitle('🔴 Live Stream Alert!')
        .setDescription(`**${interaction.user.username}** is now streaming!`)
        .addFields({ name: 'Stream Link', value: streamLink })
        .setTimestamp()
        .setThumbnail(interaction.user.displayAvatarURL());
      
      // Send the stream notification
      await streamChannel.send({
        content: `**${interaction.user.username}** is now streaming on YouTube! ${streamLink}`,
        embeds: [embed]
      });
      
      await interaction.reply({
        content: 'Your stream notification has been sent!',
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('Error handling stream command:', error);
      await interaction.reply({
        content: 'There was an error while sending the stream notification!',
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

// Handle user streaming status changes
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  try {
    // No previous presence (user just came online) or no new presence (user went offline)
    if (!oldPresence || !newPresence) return;
    
    const config = await loadConfig();
    
    // Check if stream channel is configured
    if (!config.channels || !config.channels.stream || !config.channels.stream.channelId) {
      return; // No stream channel configured, can't send notifications
    }
    
    const userId = newPresence.userId;
    
    // Check if the user just started streaming
    const wasStreaming = oldPresence.activities?.some(activity => activity.type === 1); // 1 = Streaming
    const isStreaming = newPresence.activities?.some(activity => activity.type === 1);
    
    // Get the streaming activity if it exists
    const streamingActivity = newPresence.activities?.find(activity => activity.type === 1);
    
    // User just started streaming and isn't already in our active streamers list
    if (!wasStreaming && isStreaming && !activeStreamers.has(userId) && streamingActivity) {
      // Add to active streamers to prevent duplicate notifications
      activeStreamers.add(userId);
      
      // Check if this is a YouTube stream
      const isYouTubeStream = 
        streamingActivity.url?.includes('youtube.com') || 
        streamingActivity.url?.includes('youtu.be');
      
      if (!isYouTubeStream) {
        // Not a YouTube stream, remove from active streamers and return
        activeStreamers.delete(userId);
        return;
      }
      
      // Get stream details
      const streamUrl = streamingActivity.url;
      const streamName = streamingActivity.details || 'Live Stream';
      const userName = newPresence.user?.username || 'Someone';
      
      // Get the stream notification channel
      const streamChannel = await client.channels.fetch(config.channels.stream.channelId);
      if (!streamChannel) {
        activeStreamers.delete(userId);
        return; // Channel not found
      }
      
      // Create an embedded announcement
      const embed = new EmbedBuilder()
        .setColor('#FF0000') // YouTube red
        .setTitle('🔴 Live Stream Alert!')
        .setDescription(`**${userName}** is now streaming on YouTube!`)
        .addFields(
          { name: 'Stream Title', value: streamName },
          { name: 'Stream Link', value: streamUrl }
        )
        .setTimestamp()
        .setThumbnail(newPresence.user?.displayAvatarURL());
      
      // Send the stream notification
      await streamChannel.send({
        content: `**${userName}** is now streaming on YouTube! ${streamUrl}`,
        embeds: [embed]
      });
      
      console.log(`Sent stream notification for ${userName}`);
    } 
    // User stopped streaming, remove from active streamers list
    else if (wasStreaming && !isStreaming) {
      activeStreamers.delete(userId);
    }
  } catch (error) {
    console.error('Error handling presence update:', error);
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 