export interface Branch {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  branch: string;
}

export interface Instructor {
  id: string;
  full_name: string;
}

export interface AddCourseDialogProps {
  courseTypeId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}
