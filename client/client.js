// Import required modules
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const readline = require('readline');
const Table = require('cli-table3');

// Path to gRPC .proto file
const PROTO_PATH = '../protos/farming.proto';
// Load and compile the .proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
// Load the package definition into gRPC
const farmingProto = grpc.loadPackageDefinition(packageDefinition).farming;
// Create a gRPC client instance
const client = new farmingProto.FarmService('localhost:50051', grpc.credentials.createInsecure());

// Initialize an array to store results
let resultsHistory = [];

// Function to display all results stored in history
function displayAllResults() {
  // Create a new table with appropriate headers
  const table = new Table({
      head: ['Index', 'Result'],  // Define columns
      colWidths: [10, 70],  // Set column widths
  });

  // Loop through each result in the history and add it to the table
  resultsHistory.forEach((result, index) => {
      table.push([index + 1, result]);  // Add each result as a new row
  });

  // Display the table
  console.log(table.toString());
  
  // Prompt for next operation
  promptAndHandleOperation();
}

// Function to add results to history
function addToHistory(result) {
  console.log("Adding to history:", result);
    resultsHistory.push(result);
}

// Setup the readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to handle the Unary operation from the gRPC service
function handleUnaryOperation() {
  rl.question('Enter the area for fertilizer calculation: ', (area) => {
    // Call the Calculate method provided by the gRPC service
    client.Calculate({ acres: parseFloat(area) }, (error, response) => {
      if (error) {
        console.error('Error:', error);
        return;
      }
      // If there's no error, display the result in a table
      const table = new Table({
        head: ['Description', 'Amount (kg)'],
        colWidths: [30, 20]
      });
      // Add the received response to the table
      table.push(['Fertilizer Needed', response.total_nitrogen_needed_kg.toFixed(2)]);
      // Print the table to the console
      console.log(table.toString());
      // Go back to the operation prompt
      promptAndHandleOperation();

      const result = `The amount of fertilizer needed is: ${response.total_nitrogen_needed_kg.toFixed(2)} kg`;
      console.log(result);
      addToHistory(result);
      promptAndHandleOperation();
    });
  });
}

// // Function to handle server streaming responses from the gRPC service
function handleServerStreaming() {
  // Prompt user for the sensor ID to monitor temperatures
  rl.question('Enter sensor ID for temperature data stream: ', (sensorId) => {
    // Set up a new CLI table to display temperature data with specific column settings
    const table = new Table({
      head: ['Sensor ID', 'Temperature (°C)', 'Timestamp'], // Column headers
      colWidths: [15, 20, 30] // Widths for each column
    });

    // Event listener for 'data' events, fired whenever a new piece of data is received from the server
    const call = client.TemperatureStream({ sensor_id: sensorId });
    call.on('data', (response) => {
      // Prepare a line for the table with formatted temperature data
      const line = [response.sensor_id, response.temperature.toFixed(1), response.timestamp];
      // Add this line to the CLI table
      table.push(line);
      // Also add this line to the history, joined as a single string for easier logging and display later
      addToHistory(line.join(", "));
    });

    // Event listener for 'end' events, indicating no more data will be sent
    call.on('end', () => {
      // When streaming ends, print the complete table to the console
      console.log(table.toString());
      console.log('Temperature stream ended by the server.'); // Log a confirmation message
      // Prompt the user for another operation, returning to the main menu
      promptAndHandleOperation();
    });

    // Event listener for 'error' events, handling any errors that occur during the stream
    call.on('error', (error) => {
      // Log the error to the console
      console.error('Stream error:', error);
      // Return to the main menu even in case of error
      promptAndHandleOperation();
    });
  });
}

// Function to handle client streaming for computing average soil moisture
function handleClientStreaming() {
  // Start the client streaming call and handle the response
  const call = client.ComputeAverage((error, response) => {
    if (error) {
      // Log any errors that occur during the stream
      console.error('Error:', error);
      return;
    }
    // Initialize a new table to display the results clearly
    const table = new Table({
      head: ['Description', 'Average Moisture (%)'],
      colWidths: [30, 25]
    });
    // Add the computed average moisture percentage to the table
    table.push(['Average Soil Moisture', response.soil_moisture_percentage.toFixed(2)]);
    // Print the table to the console
    console.log(table.toString());
    
    // Create a result string to summarize the outcome for history logging
    const result = `The average soil moisture percentage is: ${response.soil_moisture_percentage.toFixed(2)}%`;
    // Log the result string to the console
    console.log(result);
    // Add the result string to the history for later review
    addToHistory(result);
    // Prompt for the next operation once this one completes
    promptAndHandleOperation();
  });

  // Function to repeatedly prompt the user for moisture readings
  function readAndSendMoistureReadings() {
    // Prompt the user to enter wet and dry soil weights, or 'done' to finish sending data
    rl.question('Enter soil moisture readings (wet, dry), or "done" to finish: ', (input) => {
      if (input.toLowerCase() === 'done') {
        // If user types 'done', end the client streaming call
        call.end();
      } else {
        // Parse the input string into wet and dry weights
        const [wet, dry] = input.split(',').map(Number);
        // Write the parsed data to the server via the open stream
        call.write({ wet_soil_weight: wet, dry_soil_weight: dry });
        // Call itself recursively to allow more data entries until 'done' is entered
        readAndSendMoistureReadings();
      }
    });
  }
// Begin the recursive prompt process for entering moisture readings
  readAndSendMoistureReadings();
}

// Handle Bidirectional Streaming
function handleBidirectionalStreaming() {
  const table = new Table({
      head: ['Input Moisture', 'Optimal Watering Level'],
      colWidths: [20, 25]
  });

  const call = client.FindOptimum();

  call.on('data', (response) => {
      if (response.input_moisture !== undefined && response.recommended_level !== undefined) {
          // Convert the response to a formatted string
          const resultString = `Moisture: ${response.input_moisture.toFixed(2)}, Recommended Water Level: ${response.recommended_level.toFixed(2)} mm`;
          
          // Log the result
          console.log(resultString);

          // Add the result string to history
          addToHistory(resultString);

          // Add the response to the table for later display
          table.push([
              response.input_moisture.toFixed(2),
              response.recommended_level.toFixed(2)
          ]);
      }
  });

  // Function to prompt the user for moisture readings and send these to the server
  function sendWateringRequest() {
    // Prompt the user to enter a moisture reading or 'done' to finish
      rl.question('Enter current moisture reading, or "done" to finish: ', (moisture_reading) => {
        // Check if the user entered 'done' to terminate the input process
          if (moisture_reading.toLowerCase() === 'done') {
              // Here you display the table just before ending the call
              console.log(table.toString());
              // End the gRPC call since no more data will be sent
              call.end();
          } else {
            // If 'done' is not entered, parse the moisture reading to a float and send it to the server
              call.write({ moisture_reading: parseFloat(moisture_reading) });
              // Recursively call the same function to allow continuous data entry
              sendWateringRequest();
          }
      });
  }

  // Set up a listener for the 'end' event on the gRPC call
  call.on('end', () => {
    // Log when the stream has officially ended, indicating all data has been sent and processed
      console.log('Stream ended.');
      // Prompt the user for the next operation, returning to the main menu
      promptAndHandleOperation();
  });

  // Set up a listener for the 'error' event on the gRPC call
  call.on('error', (error) => {
    // Log any errors that occur during the streaming process
      console.error('Stream error:', error);
      // Even in the case of an error, prompt the user for the next operation
      promptAndHandleOperation();
  });
// Begin the process of sending watering requests by first calling the function
  sendWateringRequest();
}
promptAndHandleOperation();


// Function to display the main menu and handle user input
function promptAndHandleOperation() {
  rl.question('Select an operation:\n1: Fertilizer (Calculate)\n2: Temperature Stream\n3: Average Moisture\n4: Optimal Watering Level\n5: Display All Results\nEnter service number, or type "done" to exit: ', (choice) => {
    switch (choice.trim().toLowerCase()) {
      // Depending on the user choice, call the appropriate function
      case '1':
        handleUnaryOperation();
        break;
      case '2':
        handleServerStreaming();
        break;
      case '3':
        handleClientStreaming();
        break;
      case '4':
        handleBidirectionalStreaming();
        break;
      case '5':
        displayAllResults();
        break;
      case 'done':
        // If user types 'done', exit the application
        console.log('Exiting application.');
        rl.close(); // Close the readline interface
        break;
      default:
        // If input is not recognized, inform the user and prompt again
        console.log('Invalid choice.');
        promptAndHandleOperation();
        break;
    }
  });
}
// Start the application by showing the main menu
promptAndHandleOperation();


