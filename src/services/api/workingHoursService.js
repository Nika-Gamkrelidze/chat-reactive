import config from '../../config/env';

class WorkingHoursService {
  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.barrierToken = config.api.barrierToken;
    // Default working hours (09:00 to 18:00, Monday to Friday)
    this.defaultWorkingHours = {
      monday: { start: '11:00', end: '18:00', isWorkingDay: true },
      tuesday: { start: '09:00', end: '18:00', isWorkingDay: true },
      wednesday: { start: '09:00', end: '18:00', isWorkingDay: true },
      thursday: { start: '09:00', end: '18:00', isWorkingDay: true },
      friday: { start: '09:00', end: '18:00', isWorkingDay: true },
      saturday: { start: '09:00', end: '18:00', isWorkingDay: false },
      sunday: { start: '09:00', end: '18:00', isWorkingDay: false }
    };
  }

  async getWorkingHours() {
    try {
      const response = await fetch(`${this.baseUrl}${config.api.endpoints.workingHours}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.barrierToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch working hours from API, using default hours');
        return this.defaultWorkingHours;
      }

      const data = await response.json();
      
      // Validate the response structure
      if (data && typeof data === 'object') {
        return data;
      } else {
        console.warn('Invalid working hours response format, using default hours');
        return this.defaultWorkingHours;
      }
    } catch (error) {
      console.error('Error fetching working hours:', error);
      console.warn('Using default working hours due to API error');
      return this.defaultWorkingHours;
    }
  }

  /**
   * Check if current time is within working hours
   * @param {Object} workingHours - Working hours object
   * @param {Date} currentTime - Current time (optional, defaults to now)
   * @returns {Object} - {isWithinHours: boolean, currentDay: string, workingHoursToday: object}
   */
  isWithinWorkingHours(workingHours, currentTime = new Date()) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[currentTime.getDay()];
    const workingHoursToday = workingHours[currentDay];

    if (!workingHoursToday || !workingHoursToday.isWorkingDay) {
      return {
        isWithinHours: false,
        currentDay,
        workingHoursToday,
        reason: 'non_working_day'
      };
    }

    const currentTimeString = currentTime.toTimeString().substring(0, 5); // HH:MM format
    const startTime = workingHoursToday.start;
    const endTime = workingHoursToday.end;

    const isWithinHours = currentTimeString >= startTime && currentTimeString <= endTime;

    return {
      isWithinHours,
      currentDay,
      workingHoursToday,
      currentTime: currentTimeString,
      reason: isWithinHours ? 'within_hours' : 'outside_hours'
    };
  }

  /**
   * Get next working period information
   * @param {Object} workingHours - Working hours object
   * @param {Date} currentTime - Current time (optional, defaults to now)
   * @returns {Object} - Information about next working period
   */
  getNextWorkingPeriod(workingHours, currentTime = new Date()) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayNames = {
      sunday: 'კვირა',
      monday: 'ორშაბათი',
      tuesday: 'სამშაბათი',
      wednesday: 'ოთხშაბათი',
      thursday: 'ხუთშაბათი',
      friday: 'პარასკევი',
      saturday: 'შაბათი'
    };

    // Find next working day
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(currentTime);
      nextDate.setDate(currentTime.getDate() + i);
      const nextDay = days[nextDate.getDay()];
      const nextDayHours = workingHours[nextDay];

      if (nextDayHours && nextDayHours.isWorkingDay) {
        return {
          day: dayNames[nextDay],
          startTime: nextDayHours.start,
          endTime: nextDayHours.end,
          date: nextDate
        };
      }
    }

    // Fallback to Monday if no working day found
    return {
      day: dayNames.monday,
      startTime: '09:00',
      endTime: '18:00'
    };
  }
}

export const workingHoursService = new WorkingHoursService();